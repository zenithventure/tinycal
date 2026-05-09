import crypto from "crypto"
import { NextResponse } from "next/server"
import type { User } from "@prisma/client"
import prisma from "@/lib/prisma"
import { hashSecret, parseApiKey } from "./generate"
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "./rate-limit"

export type AuthSource = "api-key" | "legacy-user-id"

export interface AuthResult {
  user: User
  source: AuthSource
  apiKeyId?: string
  rateLimit?: { remaining: number; resetAt: Date }
}

const LEGACY_DEPRECATION_HEADER = `299 - "tc-legacy-api-key: pass an ApiKey from /dashboard/api-keys instead of your User ID; legacy auth will be removed in a future release"`

// Authenticate an incoming `Authorization: Bearer <token>` header.
//
// Two acceptable token shapes:
//   1. New: `tc_live_<prefix>_<secret>` — looks up ApiKey by prefix, verifies
//      sha256(secret) with timing-safe compare, applies per-key rate limit.
//   2. Legacy: a bare cuid that matches a User.id directly. README.md still
//      documents this scheme, so we keep it working with a Warning header until
//      we publish a deprecation timeline.
//
// Returns null on any failure (caller turns into 401). On success, the caller
// should also forward `applyAuthResponseHeaders(response, result)` to surface
// rate-limit headers and the legacy-deprecation Warning.
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

  // ── New-format key path ──
  if (parsed) {
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

  // ── Legacy User.id-as-Bearer path ──
  // README.md:79 documents this scheme. Keep it working but flag with Warning.
  const user = await prisma.user.findUnique({ where: { id: token } })
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return { user, source: "legacy-user-id" }
}

// Type guard — turns the union return into either the AuthResult or the
// short-circuit response, in a shape that's easy to early-return at callsites.
export function isAuthFailure(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}

// Decorates a successful response with rate-limit and (optionally) deprecation
// headers, based on the AuthResult.
export function applyAuthResponseHeaders(res: NextResponse, auth: AuthResult): NextResponse {
  if (auth.rateLimit) {
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE))
    res.headers.set("X-RateLimit-Remaining", String(auth.rateLimit.remaining))
    res.headers.set("X-RateLimit-Reset", Math.floor(auth.rateLimit.resetAt.getTime() / 1000).toString())
  }
  if (auth.source === "legacy-user-id") {
    res.headers.set("Warning", LEGACY_DEPRECATION_HEADER)
  }
  return res
}
