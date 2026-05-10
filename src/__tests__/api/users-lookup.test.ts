import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUserFindUnique = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

import { GET } from "@/app/api/users/lookup/route"

const REQUESTER = { id: "u1", email: "me@x.com" } as any
const TARGET = { id: "u2", name: "Alex", email: "alex@example.com" }

describe("GET /api/users/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(REQUESTER)
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await GET(new Request("http://x/api/users/lookup?email=alex@example.com"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when email param is missing", async () => {
    const res = await GET(new Request("http://x/api/users/lookup"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when no user matches", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)
    const res = await GET(new Request("http://x/api/users/lookup?email=nobody@x.com"))
    expect(res.status).toBe(404)
  })

  it("returns id/name/email for a matching user", async () => {
    mockUserFindUnique.mockResolvedValueOnce(TARGET)
    const res = await GET(new Request("http://x/api/users/lookup?email=alex@example.com"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ data: TARGET })
  })

  it("normalizes the email to lowercase + trim before lookup", async () => {
    mockUserFindUnique.mockResolvedValueOnce(TARGET)
    await GET(new Request("http://x/api/users/lookup?email=%20Alex%40Example.com%20"))
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alex@example.com" } })
    )
  })

  it("only selects safe fields (no token/secrets)", async () => {
    mockUserFindUnique.mockResolvedValueOnce(TARGET)
    await GET(new Request("http://x/api/users/lookup?email=alex@example.com"))
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, email: true },
      })
    )
  })
})
