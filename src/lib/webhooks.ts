import crypto from "crypto"
import { Prisma } from "@prisma/client"
import prisma from "./prisma"

// Backoff schedule. Index = attempt number that just *failed* (1-based).
// After attempt 1 fails, the next attempt is in 30s. After attempt 2, +5min.
// After attempt 3 fails, we give up.
const RETRY_DELAYS_MS = [
  30 * 1000,        // attempt 1 → 2 (30s)
  5 * 60 * 1000,    // attempt 2 → 3 (5min)
] as const

export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MS.length + 1

export function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex")
}

// Try once to POST the payload to the webhook URL. Returns the result for the
// caller to persist. Does not throw — network errors, timeouts, and non-2xx
// all surface as `ok: false`.
export async function attemptHttpDelivery(opts: {
  url: string
  payload: string
  signature: string
}): Promise<{ ok: boolean; responseCode?: number; errorMessage?: string }> {
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": opts.signature,
      },
      body: opts.payload,
    })
    if (res.ok) return { ok: true, responseCode: res.status }
    return { ok: false, responseCode: res.status, errorMessage: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, errorMessage: e instanceof Error ? e.message : String(e) }
  }
}

// Compute the next-attempt timestamp for a delivery that just failed at the
// given attempt number. Returns null if no more retries (the caller marks
// the row FAILED).
export function nextAttemptDelay(failedAttempt: number): number | null {
  return RETRY_DELAYS_MS[failedAttempt - 1] ?? null
}

// Public entrypoint: fans out an event to all matching webhooks. Each webhook
// gets its own WebhookDelivery row that tracks attempts + status. The first
// attempt happens inline; failures are picked up by the cron at
// /api/cron/webhook-retries.
export async function triggerWebhooks(userId: string, event: string, data: unknown) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true, events: { has: event } },
  })

  for (const webhook of webhooks) {
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
    const signature = signPayload(webhook.secret, payload)

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: JSON.parse(payload) as Prisma.InputJsonValue,
        signature,
        attempt: 1,
        status: "PENDING",
      },
    })

    const result = await attemptHttpDelivery({ url: webhook.url, payload, signature })
    await persistAttemptResult(delivery.id, 1, result)
  }
}

// Updates a delivery row with the result of the most recent attempt.
// Exported for the cron retry route.
export async function persistAttemptResult(
  deliveryId: string,
  attempt: number,
  result: { ok: boolean; responseCode?: number; errorMessage?: string }
): Promise<void> {
  if (result.ok) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "SUCCEEDED",
        attempt,
        responseCode: result.responseCode,
        errorMessage: null,
        nextAttemptAt: null,
      },
    })
    return
  }

  const delayMs = nextAttemptDelay(attempt)
  if (delayMs === null) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        attempt,
        responseCode: result.responseCode ?? null,
        errorMessage: result.errorMessage ?? null,
        nextAttemptAt: null,
      },
    })
    return
  }

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "PENDING",
      attempt,
      responseCode: result.responseCode ?? null,
      errorMessage: result.errorMessage ?? null,
      nextAttemptAt: new Date(Date.now() + delayMs),
    },
  })
}
