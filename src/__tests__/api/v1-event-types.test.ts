import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEventTypeFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    eventType: {
      findMany: (...args: any[]) => mockEventTypeFindMany(...args),
      create: vi.fn(),
    },
  },
}))

const TEST_USER = { id: "user-1", email: "x@y.z", name: "X" } as any

vi.mock("@/lib/api-keys/auth", () => ({
  authenticateApiKey: vi.fn(async () => ({
    user: TEST_USER,
    source: "api-key",
    apiKeyId: "ak-1",
    rateLimit: { remaining: 59, resetAt: new Date(Date.now() + 60000) },
  })),
  isAuthFailure: () => false,
  applyAuthResponseHeaders: (res: any) => res,
}))

import { GET } from "@/app/api/v1/event-types/route"

describe("GET /api/v1/event-types", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventTypeFindMany.mockResolvedValue([])
  })

  it("returns all event types when no slug filter is provided", async () => {
    await GET(new Request("http://localhost/api/v1/event-types"))

    expect(mockEventTypeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: TEST_USER.id },
      })
    )
  })

  it("filters by slug when ?slug= is passed", async () => {
    await GET(new Request("http://localhost/api/v1/event-types?slug=discovery-call"))

    expect(mockEventTypeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: TEST_USER.id, slug: "discovery-call" },
      })
    )
  })

  it("returns the standard { data: [...] } shape", async () => {
    const sample = { id: "et-1", slug: "discovery-call", title: "Discovery" }
    mockEventTypeFindMany.mockResolvedValueOnce([sample])

    const res = await GET(new Request("http://localhost/api/v1/event-types?slug=discovery-call"))
    const body = await res.json()
    expect(body).toEqual({ data: [sample] })
  })

  it("returns an empty array (not 404) when slug doesn't match", async () => {
    mockEventTypeFindMany.mockResolvedValueOnce([])

    const res = await GET(new Request("http://localhost/api/v1/event-types?slug=nope"))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ data: [] })
  })
})
