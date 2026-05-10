import { describe, it, expect, vi, beforeEach } from "vitest"

const mockWebhookFindUnique = vi.fn()
const mockWebhookDelete = vi.fn()
const mockGetAuthenticatedUser = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    webhook: {
      findMany: vi.fn(),
      findUnique: (...args: any[]) => mockWebhookFindUnique(...args),
      create: vi.fn(),
      delete: (...args: any[]) => mockWebhookDelete(...args),
    },
  },
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

import { DELETE } from "@/app/api/webhooks/route"

const OWNER = { id: "owner-1" } as any
const OTHER = { id: "other-1" } as any

function makeReq(body: unknown): Request {
  return new Request("http://x/api/webhooks", {
    method: "DELETE",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("DELETE /api/webhooks (ownership audit, #55)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue(OWNER)
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValueOnce(null)
    const res = await DELETE(makeReq({ id: "wh-1" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when id is missing or not a string", async () => {
    expect((await DELETE(makeReq({}))).status).toBe(400)
    expect((await DELETE(makeReq({ id: 123 }))).status).toBe(400)
  })

  it("returns 404 for unknown webhook id", async () => {
    mockWebhookFindUnique.mockResolvedValueOnce(null)
    const res = await DELETE(makeReq({ id: "wh-1" }))
    expect(res.status).toBe(404)
    expect(mockWebhookDelete).not.toHaveBeenCalled()
  })

  it("returns 403 when deleting someone else's webhook", async () => {
    mockWebhookFindUnique.mockResolvedValueOnce({ userId: OTHER.id })
    const res = await DELETE(makeReq({ id: "wh-1" }))
    expect(res.status).toBe(403)
    expect(mockWebhookDelete).not.toHaveBeenCalled()
  })

  it("deletes successfully when owner", async () => {
    mockWebhookFindUnique.mockResolvedValueOnce({ userId: OWNER.id })
    mockWebhookDelete.mockResolvedValueOnce({})
    const res = await DELETE(makeReq({ id: "wh-1" }))
    expect(res.status).toBe(200)
    expect(mockWebhookDelete).toHaveBeenCalledWith({ where: { id: "wh-1" } })
  })
})
