import { describe, it, expect, vi, beforeEach } from "vitest"

const mockApiKeyFindMany = vi.fn()
const mockApiKeyFindUnique = vi.fn()
const mockApiKeyCreate = vi.fn()
const mockApiKeyUpdate = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    apiKey: {
      findMany: (...args: any[]) => mockApiKeyFindMany(...args),
      findUnique: (...args: any[]) => mockApiKeyFindUnique(...args),
      create: (...args: any[]) => mockApiKeyCreate(...args),
      update: (...args: any[]) => mockApiKeyUpdate(...args),
    },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

import { GET, POST } from "@/app/api/api-keys/route"
import { POST as REVOKE } from "@/app/api/api-keys/[id]/revoke/route"

const OWNER = { id: "owner-1" } as any
const OTHER = { id: "other-1" } as any

describe("GET /api/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns 401 unauthenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("scopes the list to the requester's user id", async () => {
    mockApiKeyFindMany.mockResolvedValueOnce([])
    await GET()
    expect(mockApiKeyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OWNER.id } })
    )
  })

  it("does not expose hashedSecret in the select", async () => {
    mockApiKeyFindMany.mockResolvedValueOnce([])
    await GET()
    const select = mockApiKeyFindMany.mock.calls[0][0].select
    expect(select.hashedSecret).toBeUndefined()
  })
})

describe("POST /api/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
    mockApiKeyCreate.mockResolvedValue({
      id: "ak-1", name: "test", prefix: "abcd1234", createdAt: new Date(),
    })
  })

  function makeReq(body: unknown): Request {
    return new Request("http://x/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  }

  it("returns 401 unauthenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await POST(makeReq({ name: "test" }))
    expect(res.status).toBe(401)
  })

  it("rejects malformed JSON", async () => {
    const res = await POST(makeReq("{broken"))
    expect(res.status).toBe(400)
  })

  it("rejects missing name", async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it("rejects empty/whitespace name", async () => {
    const res = await POST(makeReq({ name: "   " }))
    expect(res.status).toBe(400)
  })

  it("rejects names over 80 chars", async () => {
    const res = await POST(makeReq({ name: "a".repeat(81) }))
    expect(res.status).toBe(400)
  })

  it("returns 201 with fullKey on success", async () => {
    const res = await POST(makeReq({ name: "Mira concierge" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.fullKey).toMatch(/^tc_live_/)
    expect(body.data.name).toBe("test")
    expect(body.data.prefix).toBeTruthy()
  })

  it("persists prefix + hashedSecret with the requester as owner", async () => {
    await POST(makeReq({ name: "Mira concierge" }))
    const data = mockApiKeyCreate.mock.calls[0][0].data
    expect(data.userId).toBe(OWNER.id)
    expect(data.prefix).toMatch(/^[0-9a-f]{8}$/)
    expect(data.hashedSecret).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("POST /api/api-keys/[id]/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns 401 unauthenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await REVOKE(new Request("http://x"), { params: { id: "ak-1" } })
    expect(res.status).toBe(401)
  })

  it("returns 404 for unknown key id", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(null)
    const res = await REVOKE(new Request("http://x"), { params: { id: "ak-1" } })
    expect(res.status).toBe(404)
  })

  it("returns 403 when revoking someone else's key", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce({ userId: OTHER.id, revokedAt: null })
    const res = await REVOKE(new Request("http://x"), { params: { id: "ak-1" } })
    expect(res.status).toBe(403)
    expect(mockApiKeyUpdate).not.toHaveBeenCalled()
  })

  it("sets revokedAt for owner's active key", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce({ userId: OWNER.id, revokedAt: null })
    mockApiKeyUpdate.mockResolvedValueOnce({})
    const res = await REVOKE(new Request("http://x"), { params: { id: "ak-1" } })
    expect(res.status).toBe(200)
    expect(mockApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ak-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    )
  })

  it("is idempotent — re-revoking is a no-op (200, no update call)", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce({
      userId: OWNER.id, revokedAt: new Date("2026-01-01"),
    })
    const res = await REVOKE(new Request("http://x"), { params: { id: "ak-1" } })
    expect(res.status).toBe(200)
    expect(mockApiKeyUpdate).not.toHaveBeenCalled()
  })
})
