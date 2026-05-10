import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEventTypeFindFirst = vi.fn()
const mockEventTypeFindUnique = vi.fn()
const mockEventTypeUpdate = vi.fn()
const mockEventTypeDelete = vi.fn()
const mockUserFindMany = vi.fn()
const mockUserCount = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    eventType: {
      findFirst: (...args: any[]) => mockEventTypeFindFirst(...args),
      findUnique: (...args: any[]) => mockEventTypeFindUnique(...args),
      update: (...args: any[]) => mockEventTypeUpdate(...args),
      delete: (...args: any[]) => mockEventTypeDelete(...args),
    },
    user: {
      findMany: (...args: any[]) => mockUserFindMany(...args),
      count: (...args: any[]) => mockUserCount(...args),
    },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

import { GET, PATCH, DELETE } from "@/app/api/event-types/[id]/route"

const OWNER = { id: "owner-1" } as any
const OTHER = { id: "other-1" } as any

const SOLO_ET = {
  id: "et-1",
  userId: "owner-1",
  isCollective: false,
  collectiveMembers: [] as string[],
  questions: [],
}

const COLLECTIVE_ET = {
  id: "et-1",
  userId: "owner-1",
  isCollective: true,
  collectiveMembers: ["alex-id", "morgan-id"],
  questions: [],
}

describe("GET /api/event-types/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns the event type with empty collectiveHosts when not collective", async () => {
    mockEventTypeFindFirst.mockResolvedValueOnce(SOLO_ET)
    const res = await GET(new Request("http://x"), { params: { id: "et-1" } })
    const body = await res.json()
    expect(body.collectiveHosts).toEqual([])
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it("resolves collectiveMembers IDs to host summaries", async () => {
    mockEventTypeFindFirst.mockResolvedValueOnce(COLLECTIVE_ET)
    mockUserFindMany.mockResolvedValueOnce([
      { id: "alex-id", name: "Alex", email: "alex@example.com" },
      { id: "morgan-id", name: "Morgan", email: "morgan@example.com" },
    ])

    const res = await GET(new Request("http://x"), { params: { id: "et-1" } })
    const body = await res.json()
    expect(body.collectiveHosts).toHaveLength(2)
    expect(body.collectiveHosts[0]).toEqual({
      id: "alex-id", name: "Alex", email: "alex@example.com",
    })
  })

  it("returns 404 when event type not owned by requester", async () => {
    mockEventTypeFindFirst.mockResolvedValueOnce(null)
    const res = await GET(new Request("http://x"), { params: { id: "et-1" } })
    expect(res.status).toBe(404)
  })
})

describe("PATCH /api/event-types/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
    mockEventTypeUpdate.mockResolvedValue({ id: "et-1" })
  })

  it("blocks PATCH on someone else's event type with 403", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OTHER.id })
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: "{}" }),
      { params: { id: "et-1" } }
    )
    expect(res.status).toBe(403)
    expect(mockEventTypeUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when event type doesn't exist at all", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce(null)
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: "{}" }),
      { params: { id: "et-1" } }
    )
    expect(res.status).toBe(404)
  })

  it("rejects collectiveMembers payload that contains unknown user IDs (400)", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
    mockUserCount.mockResolvedValueOnce(1) // only 1 of 2 IDs found

    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ collectiveMembers: ["real-id", "fake-id"] }),
      }),
      { params: { id: "et-1" } }
    )
    expect(res.status).toBe(400)
    expect(mockEventTypeUpdate).not.toHaveBeenCalled()
  })

  it("happy path: PATCH succeeds when owner + valid payload", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
    mockUserCount.mockResolvedValueOnce(2)

    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Updated",
          collectiveMembers: ["alex-id", "morgan-id"],
        }),
      }),
      { params: { id: "et-1" } }
    )
    expect(res.status).toBe(200)
    expect(mockEventTypeUpdate).toHaveBeenCalled()
  })

  it("skips the user-existence check when collectiveMembers is empty/missing", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
    await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ title: "x" }) }),
      { params: { id: "et-1" } }
    )
    expect(mockUserCount).not.toHaveBeenCalled()
  })

  describe("slug validation", () => {
    beforeEach(() => {
      mockEventTypeFindUnique.mockResolvedValue({ userId: OWNER.id })
    })

    it("accepts a valid slug", async () => {
      const res = await PATCH(
        new Request("http://x", { method: "PATCH", body: JSON.stringify({ slug: "discovery-call" }) }),
        { params: { id: "et-1" } }
      )
      expect(res.status).toBe(200)
      expect(mockEventTypeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: "discovery-call" }) })
      )
    })

    it("rejects empty slug", async () => {
      const res = await PATCH(
        new Request("http://x", { method: "PATCH", body: JSON.stringify({ slug: "" }) }),
        { params: { id: "et-1" } }
      )
      expect(res.status).toBe(400)
    })

    it("rejects slug with uppercase, underscores, or spaces", async () => {
      for (const bad of ["BadSlug", "bad_slug", "bad slug", "-bad", "bad-", "bad--slug"]) {
        mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
        const res = await PATCH(
          new Request("http://x", { method: "PATCH", body: JSON.stringify({ slug: bad }) }),
          { params: { id: "et-1" } }
        )
        expect(res.status, `slug=${bad} should fail`).toBe(400)
      }
    })

    it("rejects slug over 80 chars", async () => {
      const res = await PATCH(
        new Request("http://x", { method: "PATCH", body: JSON.stringify({ slug: "a".repeat(81) }) }),
        { params: { id: "et-1" } }
      )
      expect(res.status).toBe(400)
    })

    it("returns friendly 409 on Prisma P2002 (duplicate slug)", async () => {
      const { Prisma } = await import("@prisma/client")
      mockEventTypeUpdate.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint violated", {
          code: "P2002", clientVersion: "5.22.0",
        })
      )

      const res = await PATCH(
        new Request("http://x", { method: "PATCH", body: JSON.stringify({ slug: "discovery-call" }) }),
        { params: { id: "et-1" } }
      )
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("already have an event type with this slug")
    })

    it("ignores slug entirely when not provided in body", async () => {
      const res = await PATCH(
        new Request("http://x", { method: "PATCH", body: JSON.stringify({ title: "Just a rename" }) }),
        { params: { id: "et-1" } }
      )
      expect(res.status).toBe(200)
    })
  })
})

describe("DELETE /api/event-types/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("blocks DELETE on someone else's event type with 403", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OTHER.id })
    const res = await DELETE(new Request("http://x"), { params: { id: "et-1" } })
    expect(res.status).toBe(403)
    expect(mockEventTypeDelete).not.toHaveBeenCalled()
  })

  it("happy path: DELETE succeeds for owner", async () => {
    mockEventTypeFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
    mockEventTypeDelete.mockResolvedValueOnce({})
    const res = await DELETE(new Request("http://x"), { params: { id: "et-1" } })
    expect(res.status).toBe(200)
    expect(mockEventTypeDelete).toHaveBeenCalled()
  })
})
