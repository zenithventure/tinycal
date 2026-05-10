import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockUpdateMany = vi.fn()
const mockCount = vi.fn()
const mockFindFirst = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    calendarConnection: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
      delete: (...args: any[]) => mockDelete(...args),
      updateMany: (...args: any[]) => mockUpdateMany(...args),
      count: (...args: any[]) => mockCount(...args),
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

import { PATCH, DELETE } from "@/app/api/calendar-connections/[id]/route"

const OWNER = { id: "owner-1" } as any
const OTHER = { id: "other-1" } as any

describe("PATCH /api/calendar-connections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns 403 (not 401) when connection belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER.id })
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: "{}" }),
      { params: { id: "conn-1" } }
    )
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when connection does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: "{}" }),
      { params: { id: "conn-1" } }
    )
    expect(res.status).toBe(404)
  })

  it("happy path: PATCH succeeds for owner", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OWNER.id, isPrimary: false })
    mockUpdate.mockResolvedValueOnce({ id: "conn-1" })
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ label: "Work" }) }),
      { params: { id: "conn-1" } }
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalled()
  })
})

describe("DELETE /api/calendar-connections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns 403 when connection belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OTHER.id })
    const res = await DELETE(new Request("http://x"), { params: { id: "conn-1" } })
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("returns 404 when connection does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const res = await DELETE(new Request("http://x"), { params: { id: "conn-1" } })
    expect(res.status).toBe(404)
  })

  it("returns 400 when trying to delete the last connection", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OWNER.id, isPrimary: false })
    mockCount.mockResolvedValueOnce(1)
    const res = await DELETE(new Request("http://x"), { params: { id: "conn-1" } })
    expect(res.status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("happy path: DELETE succeeds and promotes oldest as new primary if deleted was primary", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: OWNER.id, isPrimary: true })
    mockCount.mockResolvedValueOnce(2)
    mockDelete.mockResolvedValueOnce({})
    mockFindFirst.mockResolvedValueOnce({ id: "conn-2" })
    mockUpdate.mockResolvedValueOnce({})
    const res = await DELETE(new Request("http://x"), { params: { id: "conn-1" } })
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "conn-2" },
      data: { isPrimary: true },
    })
  })
})
