import prisma from "@/lib/prisma"

export const RATE_LIMIT_PER_MINUTE = 60

// Truncates a Date to the start of its minute (UTC). Used as the bucket key
// for the per-minute rate limiter.
function windowStartFor(now: Date): Date {
  const w = new Date(now)
  w.setUTCSeconds(0, 0)
  return w
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

// Atomically increments the counter for (apiKeyId, current minute) and returns
// whether the request is allowed. Backed by ApiKeyUsage so it survives across
// instances (Amplify can scale horizontally) without needing a shared cache.
export async function checkRateLimit(apiKeyId: string, now = new Date()): Promise<RateLimitResult> {
  const windowStart = windowStartFor(now)
  const resetAt = new Date(windowStart.getTime() + 60_000)

  const usage = await prisma.apiKeyUsage.upsert({
    where: { apiKeyId_windowStart: { apiKeyId, windowStart } },
    update: { count: { increment: 1 } },
    create: { apiKeyId, windowStart, count: 1 },
    select: { count: true },
  })

  const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - usage.count)
  return {
    allowed: usage.count <= RATE_LIMIT_PER_MINUTE,
    remaining,
    resetAt,
  }
}
