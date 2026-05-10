import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000  // 24h

// Deterministic JSON serialization — sorts object keys recursively so that
// {a:1,b:2} and {b:2,a:1} produce the same hash. Critical for the
// "same key, same body" check to behave correctly.
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]"
  const keys = Object.keys(v as object).sort()
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJson((v as Record<string, unknown>)[k])).join(",") + "}"
}

export function hashRequestBody(body: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(body)).digest("hex")
}

export type IdempotencyLookup =
  | { kind: "miss" }
  | { kind: "replay"; response: NextResponse }
  | { kind: "mismatch" }

// Check whether this Idempotency-Key has been used before for this API key.
// Returns:
//   - "miss"       — proceed with the handler, then call recordIdempotentResponse on success
//   - "replay"     — return the cached response verbatim, with X-Idempotent-Replay header
//   - "mismatch"   — caller should return 409 (same key, different body)
export async function lookupIdempotency(
  apiKeyId: string,
  idempotencyKey: string,
  requestHash: string
): Promise<IdempotencyLookup> {
  const cached = await prisma.idempotencyKey.findUnique({
    where: { apiKeyId_key: { apiKeyId, key: idempotencyKey } },
  })

  if (!cached) return { kind: "miss" }

  // Treat stale rows as miss — opportunistically clean up so the unique
  // constraint doesn't block the new insert.
  if (Date.now() - cached.createdAt.getTime() >= IDEMPOTENCY_TTL_MS) {
    await prisma.idempotencyKey.delete({ where: { id: cached.id } }).catch(() => {})
    return { kind: "miss" }
  }

  if (cached.requestHash !== requestHash) return { kind: "mismatch" }

  const response = new NextResponse(JSON.stringify(cached.responseBody), {
    status: cached.responseStatus,
    headers: {
      "Content-Type": "application/json",
      "X-Idempotent-Replay": "true",
    },
  })
  return { kind: "replay", response }
}

// Persist the response so a subsequent request with the same Idempotency-Key
// gets the same answer. Stripe-style: only cache success — clients must be
// free to retry on failure.
export async function recordIdempotentResponse(opts: {
  apiKeyId: string
  idempotencyKey: string
  requestHash: string
  responseStatus: number
  responseBody: unknown
}): Promise<void> {
  if (opts.responseStatus < 200 || opts.responseStatus >= 300) return

  try {
    await prisma.idempotencyKey.create({
      data: {
        apiKeyId: opts.apiKeyId,
        key: opts.idempotencyKey,
        requestHash: opts.requestHash,
        responseStatus: opts.responseStatus,
        responseBody: opts.responseBody as Prisma.InputJsonValue,
      },
    })
  } catch (e) {
    // Race: a concurrent request with the same (apiKeyId, key) inserted first.
    // The first request "wins" — its response is canonical. The second created
    // a duplicate downstream resource (the actual booking, in this case), which
    // is the known-tradeoff of the simple insert-after pattern. Logged so it's
    // observable; for Mira's sequential-retry use case it shouldn't happen.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      console.warn(`Idempotency race on (${opts.apiKeyId}, ${opts.idempotencyKey}): another request stored first`)
      return
    }
    throw e
  }
}
