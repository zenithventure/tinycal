import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { attemptHttpDelivery, persistAttemptResult } from "@/lib/webhooks"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

// Cron-driven retry of failed webhook deliveries.
//
// Pickup criteria: status=PENDING AND nextAttemptAt <= now.
// Every PENDING delivery with a past nextAttemptAt gets one more attempt;
// persistAttemptResult() handles the state transition (success → SUCCEEDED,
// failure → either next backoff or FAILED if MAX_DELIVERY_ATTEMPTS reached).
//
// Recommended schedule: every 1–2 minutes. 30s is the smallest backoff so
// 1min granularity is fine.
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
    },
    include: { webhook: true },
    take: 100,
  })

  let succeeded = 0
  let stillRetrying = 0
  let failed = 0

  for (const delivery of due) {
    const payload = JSON.stringify(delivery.payload)
    const result = await attemptHttpDelivery({
      url: delivery.webhook.url,
      payload,
      signature: delivery.signature,
    })
    const newAttempt = delivery.attempt + 1
    await persistAttemptResult(delivery.id, newAttempt, result)

    if (result.ok) succeeded++
    else if (newAttempt >= 3) failed++
    else stillRetrying++
  }

  return NextResponse.json({
    processed: due.length,
    succeeded,
    stillRetrying,
    failed,
  })
}
