import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEventTypeFindMany = vi.fn()
const mockEventTypeCount = vi.fn()
const mockEventTypeCreate = vi.fn()
const mockAvailabilityScheduleFindFirst = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    eventType: {
      findMany: (...args: any[]) => mockEventTypeFindMany(...args),
      count: (...args: any[]) => mockEventTypeCount(...args),
      create: (...args: any[]) => mockEventTypeCreate(...args),
    },
    availabilitySchedule: {
      findFirst: (...args: any[]) => mockAvailabilityScheduleFindFirst(...args),
    },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils")
  return { ...actual, generateSlug: (s: string) => s.toLowerCase().replace(/\s+/g, "-") }
})

import { GET, POST } from "@/app/api/event-types/route"

const OWNER = { id: "owner-1", plan: "PRO" } as any
const COHOST = { id: "cohost-1", plan: "PRO" } as any

describe("GET /api/event-types", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when no authenticated user", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("queries with OR(userId, collective+member) so co-hosts also see the event type", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(COHOST)
    mockEventTypeFindMany.mockResolvedValueOnce([])

    await GET()

    expect(mockEventTypeFindMany).toHaveBeenCalledTimes(1)
    const arg = mockEventTypeFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      OR: [
        { userId: "cohost-1" },
        { isCollective: true, collectiveMembers: { has: "cohost-1" } },
      ],
    })
    // Owner summary needed for the dashboard to render co-hosted events correctly.
    expect(arg.include.user.select).toMatchObject({
      id: true, name: true, email: true, slug: true,
    })
  })

  it("tags each row with viewerRole=OWNER vs CO_HOST based on userId", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(COHOST)
    mockEventTypeFindMany.mockResolvedValueOnce([
      { id: "et-mine", userId: "cohost-1", title: "My own", isCollective: false, collectiveMembers: [] },
      { id: "et-shared", userId: "owner-1", title: "Discovery call", isCollective: true, collectiveMembers: ["cohost-1"] },
    ])

    const res = await GET()
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ id: "et-mine", viewerRole: "OWNER" })
    expect(body[1]).toMatchObject({ id: "et-shared", viewerRole: "CO_HOST" })
  })
})

describe("POST /api/event-types", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
    mockEventTypeCreate.mockResolvedValue({ id: "new" })
  })

  it("creates an event type for an authenticated user", async () => {
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ title: "Quick chat" }),
      })
    )
    expect(res.status).toBe(200)
    expect(mockEventTypeCreate).toHaveBeenCalled()
  })
})
