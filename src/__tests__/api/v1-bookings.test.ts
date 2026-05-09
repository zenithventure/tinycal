import { describe, it, expect, vi, beforeEach } from "vitest"

const mockBookingFindMany = vi.fn()
const mockCreateBooking = vi.fn()
const mockAuthenticateApiKey = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    booking: { findMany: (...args: any[]) => mockBookingFindMany(...args) },
  },
}))

vi.mock("@/lib/bookings/create", () => ({
  createBooking: (...args: any[]) => mockCreateBooking(...args),
}))

vi.mock("@/lib/api-keys/auth", () => ({
  authenticateApiKey: (...args: any[]) => mockAuthenticateApiKey(...args),
  isAuthFailure: (r: any) =>
    r &&
    typeof r === "object" &&
    "status" in r &&
    typeof r.status === "number" &&
    "headers" in r,
  applyAuthResponseHeaders: (res: any) => res,
}))

import { POST } from "@/app/api/v1/bookings/route"

const TEST_USER = { id: "user-1", email: "x@y.z", name: "X" } as any
const VALID_BODY = {
  eventTypeId: "et-1",
  startTime: "2026-06-01T15:00:00.000Z",
  bookerName: "Alex",
  bookerEmail: "alex@example.com",
  bookerTimezone: "America/Los_Angeles",
}

function makePostReq(body: unknown): Request {
  return new Request("http://localhost/api/v1/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer fake" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/v1/bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticateApiKey.mockResolvedValue({
      user: TEST_USER,
      source: "api-key",
      apiKeyId: "ak-1",
      rateLimit: { remaining: 59, resetAt: new Date() },
    })
    mockCreateBooking.mockResolvedValue({
      ok: true,
      booking: { id: "bk-1", meetingUrl: "https://meet/x" },
    })
  })

  describe("auth", () => {
    it("returns whatever authenticateApiKey returns on failure (401)", async () => {
      const failure = new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
      mockAuthenticateApiKey.mockResolvedValueOnce(failure)
      const res = await POST(makePostReq(VALID_BODY))
      expect(res.status).toBe(401)
    })
  })

  describe("validation", () => {
    it("rejects malformed JSON", async () => {
      const res = await POST(makePostReq("{not-json"))
      expect(res.status).toBe(400)
    })

    it("rejects missing required fields", async () => {
      const res = await POST(makePostReq({ eventTypeId: "et-1" }))
      expect(res.status).toBe(400)
      expect(mockCreateBooking).not.toHaveBeenCalled()
    })

    it("rejects non-ISO startTime", async () => {
      const res = await POST(makePostReq({ ...VALID_BODY, startTime: "tomorrow at 3pm" }))
      expect(res.status).toBe(400)
    })

    it("rejects invalid bookerEmail", async () => {
      const res = await POST(makePostReq({ ...VALID_BODY, bookerEmail: "not-an-email" }))
      expect(res.status).toBe(400)
    })
  })

  describe("ownership", () => {
    it("passes requireOwnerUserId = auth.user.id to createBooking", async () => {
      await POST(makePostReq(VALID_BODY))
      expect(mockCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({ requireOwnerUserId: TEST_USER.id })
      )
    })

    it("returns 403 when createBooking reports FORBIDDEN", async () => {
      mockCreateBooking.mockResolvedValueOnce({ ok: false, error: "FORBIDDEN", status: 403 })
      const res = await POST(makePostReq(VALID_BODY))
      expect(res.status).toBe(403)
    })
  })

  describe("error mapping", () => {
    it("returns 404 for EVENT_TYPE_NOT_FOUND", async () => {
      mockCreateBooking.mockResolvedValueOnce({
        ok: false,
        error: "EVENT_TYPE_NOT_FOUND",
        status: 404,
      })
      const res = await POST(makePostReq(VALID_BODY))
      expect(res.status).toBe(404)
    })

    it("returns 409 for CONFLICT", async () => {
      mockCreateBooking.mockResolvedValueOnce({ ok: false, error: "CONFLICT", status: 409 })
      const res = await POST(makePostReq(VALID_BODY))
      expect(res.status).toBe(409)
    })
  })

  describe("happy path", () => {
    it("returns 201 with the created booking under data.", async () => {
      const res = await POST(makePostReq(VALID_BODY))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toEqual({ data: { id: "bk-1", meetingUrl: "https://meet/x" } })
    })
  })
})
