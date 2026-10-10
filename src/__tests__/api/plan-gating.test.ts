import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEventTypeCount = vi.fn()
const mockEventTypeCreate = vi.fn()
const mockEventTypeFindUnique = vi.fn()
const mockEventTypeUpdate = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    eventType: {
      count: (...args: any[]) => mockEventTypeCount(...args),
      create: (...args: any[]) => mockEventTypeCreate(...args),
      findUnique: (...args: any[]) => mockEventTypeFindUnique(...args),
      update: (...args: any[]) => mockEventTypeUpdate(...args),
    },
    availabilitySchedule: { findFirst: vi.fn() },
    user: { count: vi.fn() },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

vi.mock("@/lib/track", () => ({ track: vi.fn() }))

// The v1 route authenticates via API key; the user is swapped per test.
let v1User: any
vi.mock("@/lib/api-keys/auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ user: v1User, source: "api-key", apiKeyId: "ak-1" })),
  isAuthFailure: () => false,
  applyAuthResponseHeaders: (res: any) => res,
}))

import { isPro, requirePro, PlanGateError, enforceEventTypeLimit } from "@/lib/plan"
import { POST as dashboardPost } from "@/app/api/event-types/route"
import { PATCH } from "@/app/api/event-types/[id]/route"
import { POST as v1Post } from "@/app/api/v1/event-types/route"

const free = () => ({ id: "u1", plan: "FREE" }) as any
const pro = () => ({ id: "u1", plan: "PRO" }) as any

const post = (body: object) =>
  new Request("http://x", { method: "POST", body: JSON.stringify({ title: "Chat", ...body }) })
const patch = (body: object) =>
  new Request("http://x", { method: "PATCH", body: JSON.stringify(body) })
const ctx = { params: { id: "et-1" } }

beforeEach(() => {
  vi.clearAllMocks()
  mockEventTypeCount.mockResolvedValue(0)
  mockEventTypeCreate.mockResolvedValue({ id: "new", collectiveMemberships: [] })
  mockEventTypeFindUnique.mockResolvedValue({ userId: "u1", requirePayment: false })
  mockEventTypeUpdate.mockResolvedValue({ id: "et-1", collectiveMemberships: [] })
})

describe("requirePro guard", () => {
  it("throws a 402 PlanGateError for FREE, passes for PRO", () => {
    expect(isPro(pro())).toBe(true)
    expect(() => requirePro(pro(), "paid_event_types")).not.toThrow()
    try {
      requirePro(free(), "paid_event_types")
      throw new Error("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(PlanGateError)
      expect((e as PlanGateError).status).toBe(402)
      expect((e as PlanGateError).code).toBe("PRO_REQUIRED")
    }
  })

  it("treats a missing plan as not PRO", () => {
    expect(isPro({})).toBe(false)
  })

  it("enforceEventTypeLimit skips the count query for PRO", async () => {
    await enforceEventTypeLimit(pro())
    expect(mockEventTypeCount).not.toHaveBeenCalled()
  })
})

describe("event-type cap — dashboard POST /api/event-types", () => {
  it("blocks a FREE user at the cap with 402", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    mockEventTypeCount.mockResolvedValue(1)
    const res = await dashboardPost(post({}))
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe("PRO_REQUIRED")
    expect(mockEventTypeCreate).not.toHaveBeenCalled()
  })

  it("allows a FREE user under the cap", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    const res = await dashboardPost(post({}))
    expect(res.status).toBe(200)
  })

  it("allows a PRO user past the cap", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(pro())
    mockEventTypeCount.mockResolvedValue(5)
    const res = await dashboardPost(post({}))
    expect(res.status).toBe(200)
  })

  it("upgrade transition: blocked as FREE, succeeds right after plan flips to PRO", async () => {
    mockEventTypeCount.mockResolvedValue(1)
    mockGetAuthenticatedUser.mockResolvedValueOnce(free())
    expect((await dashboardPost(post({}))).status).toBe(402)
    mockGetAuthenticatedUser.mockResolvedValueOnce(pro())
    expect((await dashboardPost(post({}))).status).toBe(200)
  })
})

describe("event-type cap — v1 POST /api/v1/event-types", () => {
  it("blocks a FREE user at the cap with 402", async () => {
    v1User = free()
    mockEventTypeCount.mockResolvedValue(1)
    const res = await v1Post(post({}))
    expect(res.status).toBe(402)
    expect(mockEventTypeCreate).not.toHaveBeenCalled()
  })

  it("allows a PRO user past the cap (201)", async () => {
    v1User = pro()
    mockEventTypeCount.mockResolvedValue(5)
    const res = await v1Post(post({}))
    expect(res.status).toBe(201)
  })

  it("upgrade transition: 402 as FREE, 201 after flip to PRO", async () => {
    mockEventTypeCount.mockResolvedValue(1)
    v1User = free()
    expect((await v1Post(post({}))).status).toBe(402)
    v1User = pro()
    expect((await v1Post(post({}))).status).toBe(201)
  })
})

describe("paid event types — dashboard POST", () => {
  it("blocks FREE with requirePayment (402)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    const res = await dashboardPost(post({ requirePayment: true, price: 10 }))
    expect(res.status).toBe(402)
    expect((await res.json()).feature).toBe("paid_event_types")
    expect(mockEventTypeCreate).not.toHaveBeenCalled()
  })

  it("allows FREE without requirePayment", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    expect((await dashboardPost(post({ requirePayment: false }))).status).toBe(200)
  })

  it("allows PRO with requirePayment", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(pro())
    expect((await dashboardPost(post({ requirePayment: true, price: 10 }))).status).toBe(200)
  })

  it("upgrade transition: 402 as FREE, 200 after flip to PRO", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(free())
    expect((await dashboardPost(post({ requirePayment: true, price: 10 }))).status).toBe(402)
    mockGetAuthenticatedUser.mockResolvedValueOnce(pro())
    expect((await dashboardPost(post({ requirePayment: true, price: 10 }))).status).toBe(200)
  })
})

describe("paid event types — dashboard PATCH", () => {
  it("blocks FREE turning requirePayment on (402)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    const res = await PATCH(patch({ requirePayment: true, price: 10 }), ctx)
    expect(res.status).toBe(402)
    expect(mockEventTypeUpdate).not.toHaveBeenCalled()
  })

  it("allows PRO turning requirePayment on", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(pro())
    expect((await PATCH(patch({ requirePayment: true, price: 10 }), ctx)).status).toBe(200)
  })

  it("allows FREE edits that don't enable payment", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    expect((await PATCH(patch({ title: "New", requirePayment: false }), ctx)).status).toBe(200)
  })

  it("lets a downgraded user keep editing an event type that already has payment on", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(free())
    mockEventTypeFindUnique.mockResolvedValue({ userId: "u1", requirePayment: true })
    expect((await PATCH(patch({ title: "New", requirePayment: true }), ctx)).status).toBe(200)
  })

  it("upgrade transition: 402 as FREE, 200 after flip to PRO", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(free())
    expect((await PATCH(patch({ requirePayment: true }), ctx)).status).toBe(402)
    mockGetAuthenticatedUser.mockResolvedValueOnce(pro())
    expect((await PATCH(patch({ requirePayment: true }), ctx)).status).toBe(200)
  })
})
