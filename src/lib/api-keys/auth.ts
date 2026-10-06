import crypto from "crypto"
import { NextResponse } from "next/server"
import type { User } from "@prisma/client"
import prisma from "@/lib/prisma"
import { hashSecret, parseApiKey } from "./generate"
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "./rate-limit"

export type AuthSource = "api-key"

export interface AuthResult {
  user: User
  source: AuthSource
  apiKeyId?: string
  rateLimit?: { remaining: number; resetAt: Date }
}

// Authenticate an incoming `Authorization: Bearer <token>` header.
//
// Only `tc_live_<prefix>_<secret>` keys authenticate: looks up ApiKey by prefix,
// verifies sha256(secret) with timing-safe compare, applies per-key rate limit.
// Anything else (including a bare User.id, which is not a secret) gets a 401.
//
// Returns a 401/429 NextResponse on failure. On success, the caller should also
// forward `applyAuthResponseHeaders(response, result)` to surface rate-limit
// headers.
export async function authenticateApiKey(req: Request): Promise<AuthResult | NextResponse> {
  const auth = req.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const token = auth.slice(7).trim()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = parseApiKey(token)
  if (!parsed) {
    return NextResponse.json(
      { error: "Unauthorized: use a tc_live_* API key from /dashboard/api-keys as the Bearer token" },
      { status: 401 }
    )
  }

  const apiKey = await prisma.apiKey.findUnique({ where: { prefix: parsed.prefix } })
  if (!apiKey || apiKey.revokedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const candidateHash = hashSecret(parsed.secret)
  const stored = Buffer.from(apiKey.hashedSecret, "hex")
  const candidate = Buffer.from(candidateHash, "hex")
  if (stored.length !== candidate.length || !crypto.timingSafeEqual(stored, candidate)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rl = await checkRateLimit(apiKey.id)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": Math.floor(rl.resetAt.getTime() / 1000).toString(),
          "Retry-After": Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)).toString(),
        },
      }
    )
  }

  const user = await prisma.user.findUnique({ where: { id: apiKey.userId } })
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // fire-and-forget: lastUsedAt is observability, not correctness
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch((e) => console.error("apiKey.lastUsedAt update failed:", e))

  return {
    user,
    source: "api-key",
    apiKeyId: apiKey.id,
    rateLimit: { remaining: rl.remaining, resetAt: rl.resetAt },
  }
}

// Type guard — turns the union return into either the AuthResult or the
// short-circuit response, in a shape that's easy to early-return at callsites.
export function isAuthFailure(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}

// Decorates a successful response with rate-limit headers, based on the AuthResult.
export function applyAuthResponseHeaders(res: NextResponse, auth: AuthResult): NextResponse {
  if (auth.rateLimit) {
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE))
    res.headers.set("X-RateLimit-Remaining", String(auth.rateLimit.remaining))
    res.headers.set("X-RateLimit-Reset", Math.floor(auth.rateLimit.resetAt.getTime() / 1000).toString())
  }
  return res
}
