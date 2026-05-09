import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
import { authenticateApiKey, isAuthFailure } from "../auth"
import { generateApiKey, hashSecret } from "../generate"

const mockApiKeyFindUnique = vi.fn()
const mockApiKeyUpdate = vi.fn()
const mockUserFindUnique = vi.fn()
const mockUsageUpsert = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    apiKey: {
      findUnique: (...args: any[]) => mockApiKeyFindUnique(...args),
      update: (...args: any[]) => mockApiKeyUpdate(...args),
    },
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
    apiKeyUsage: {
      upsert: (...args: any[]) => mockUsageUpsert(...args),
    },
  },
}))

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/event-types", { headers })
}

const TEST_USER = { id: "user-1", email: "x@y.z", name: "X" } as any

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiKeyUpdate.mockResolvedValue({})
    mockUsageUpsert.mockResolvedValue({ count: 1 })
  })

  describe("missing or malformed Authorization", () => {
    it("returns 401 when header is absent", async () => {
      const result = await authenticateApiKey(makeReq())
      expect(isAuthFailure(result)).toBe(true)
      expect((result as NextResponse).status).toBe(401)
    })

    it("returns 401 when scheme is not Bearer", async () => {
      const result = await authenticateApiKey(makeReq({ Authorization: "Basic abc" }))
      expect(isAuthFailure(result)).toBe(true)
    })

    it("returns 401 when token is empty after Bearer", async () => {
      const result = await authenticateApiKey(makeReq({ Authorization: "Bearer " }))
      expect(isAuthFailure(result)).toBe(true)
    })
  })

  describe("new API key path", () => {
    it("authenticates a valid key", async () => {
      const { fullKey, prefix, hashedSecret } = generateApiKey()

      mockApiKeyFindUnique.mockResolvedValueOnce({
        id: "ak-1",
        userId: TEST_USER.id,
        prefix,
        hashedSecret,
        revokedAt: null,
        expiresAt: null,
      })
      mockUserFindUnique.mockResolvedValueOnce(TEST_USER)

      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${fullKey}` }))
      expect(isAuthFailure(result)).toBe(false)
      if (!isAuthFailure(result)) {
        expect(result.user.id).toBe(TEST_USER.id)
        expect(result.source).toBe("api-key")
        expect(result.apiKeyId).toBe("ak-1")
        expect(result.rateLimit?.remaining).toBeGreaterThanOrEqual(0)
      }
    })

    it("rejects a key with a wrong secret (timing-safe compare)", async () => {
      const { prefix } = generateApiKey()
      const wrongKey = `tc_live_${prefix}_${"00".repeat(32)}`

      mockApiKeyFindUnique.mockResolvedValueOnce({
        id: "ak-1",
        userId: TEST_USER.id,
        prefix,
        hashedSecret: hashSecret("a-different-secret"),
        revokedAt: null,
        expiresAt: null,
      })

      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${wrongKey}` }))
      expect(isAuthFailure(result)).toBe(true)
      expect((result as NextResponse).status).toBe(401)
    })

    it("rejects an unknown prefix", async () => {
      mockApiKeyFindUnique.mockResolvedValueOnce(null)
      const result = await authenticateApiKey(
        makeReq({ Authorization: `Bearer tc_live_deadbeef_${"a".repeat(64)}` })
      )
      expect(isAuthFailure(result)).toBe(true)
    })

    it("rejects a revoked key", async () => {
      const { fullKey, prefix, hashedSecret } = generateApiKey()
      mockApiKeyFindUnique.mockResolvedValueOnce({
        id: "ak-1",
        userId: TEST_USER.id,
        prefix,
        hashedSecret,
        revokedAt: new Date("2026-01-01"),
        expiresAt: null,
      })
      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${fullKey}` }))
      expect(isAuthFailure(result)).toBe(true)
    })

    it("rejects an expired key", async () => {
      const { fullKey, prefix, hashedSecret } = generateApiKey()
      mockApiKeyFindUnique.mockResolvedValueOnce({
        id: "ak-1",
        userId: TEST_USER.id,
        prefix,
        hashedSecret,
        revokedAt: null,
        expiresAt: new Date("2020-01-01"),
      })
      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${fullKey}` }))
      expect(isAuthFailure(result)).toBe(true)
    })

    it("returns 429 when rate limit is exceeded", async () => {
      const { fullKey, prefix, hashedSecret } = generateApiKey()
      mockApiKeyFindUnique.mockResolvedValueOnce({
        id: "ak-1",
        userId: TEST_USER.id,
        prefix,
        hashedSecret,
        revokedAt: null,
        expiresAt: null,
      })
      mockUsageUpsert.mockResolvedValueOnce({ count: 61 }) // over the 60/min limit

      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${fullKey}` }))
      expect(isAuthFailure(result)).toBe(true)
      const res = result as NextResponse
      expect(res.status).toBe(429)
      expect(res.headers.get("Retry-After")).not.toBeNull()
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
    })
  })

  describe("legacy User.id path", () => {
    it("falls back to User.id lookup for non-tc_live tokens", async () => {
      mockUserFindUnique.mockResolvedValueOnce(TEST_USER)
      const result = await authenticateApiKey(makeReq({ Authorization: `Bearer ${TEST_USER.id}` }))
      expect(isAuthFailure(result)).toBe(false)
      if (!isAuthFailure(result)) {
        expect(result.source).toBe("legacy-user-id")
        expect(result.user.id).toBe(TEST_USER.id)
      }
      // Should NOT have hit the apiKey table
      expect(mockApiKeyFindUnique).not.toHaveBeenCalled()
    })

    it("rejects an unknown legacy token", async () => {
      mockUserFindUnique.mockResolvedValueOnce(null)
      const result = await authenticateApiKey(makeReq({ Authorization: "Bearer unknown-cuid" }))
      expect(isAuthFailure(result)).toBe(true)
    })
  })
})
