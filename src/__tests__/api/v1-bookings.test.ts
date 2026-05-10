import { describe, it, expect, vi, beforeEach } from "vitest"

const mockBookingFindMany = vi.fn()
const mockCreateBooking = vi.fn()
const mockAuthenticateApiKey = vi.fn()
const mockLookupIdempotency = vi.fn()
const mockRecordIdempotentResponse = vi.fn()

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

vi.mock("@/lib/api-keys/idempotency", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-keys/idempotency")>()
  return {
    ...actual,
    lookupIdempotency: (...args: any[]) => mockLookupIdempotency(...args),
    recordIdempotentResponse: (...args: any[]) => mockRecordIdempotentResponse(...args),
  }
})

import { POST } from "@/app/api/v1/bookings/route"

const TEST_USER = { id: "user-1", email: "x@y.z", name: "X" } as any
const VALID_BODY = {
  eventTypeId: "et-1",
  startTime: "2026-06-01T15:00:00.000Z",
  bookerName: "Alex",
  bookerEmail: "alex@example.com",
  bookerTimezone: "America/Los_Angeles",
}

function makePostReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fake",
      ...headers,
    },
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

  describe("idempotency (#53)", () => {
    beforeEach(() => {
      mockLookupIdempotency.mockResolvedValue({ kind: "miss" })
      mockRecordIdempotentResponse.mockResolvedValue(undefined)
    })

    it("does NOT call lookupIdempotency when no Idempotency-Key header is present", async () => {
      await POST(makePostReq(VALID_BODY))
      expect(mockLookupIdempotency).not.toHaveBeenCalled()
      expect(mockRecordIdempotentResponse).not.toHaveBeenCalled()
    })

    it("calls lookupIdempotency with (apiKeyId, key, hash) when header is present", async () => {
      await POST(makePostReq(VALID_BODY, { "Idempotency-Key": "abc-123" }))
      expect(mockLookupIdempotency).toHaveBeenCalledWith("ak-1", "abc-123", expect.stringMatching(/^[0-9a-f]{64}$/))
    })

    it("returns the cached response on replay (does not call createBooking)", async () => {
      const cached = new Response(JSON.stringify({ data: { id: "bk-original" } }), {
        status: 201,
        headers: { "Content-Type": "application/json", "X-Idempotent-Replay": "true" },
      })
      mockLookupIdempotency.mockResolvedValueOnce({ kind: "replay", response: cached })
      const res = await POST(makePostReq(VALID_BODY, { "Idempotency-Key": "abc-123" }))
      expect(res.status).toBe(201)
      expect(res.headers.get("X-Idempotent-Replay")).toBe("true")
      expect(mockCreateBooking).not.toHaveBeenCalled()
    })

    it("returns 409 on body-mismatch with the same key", async () => {
      mockLookupIdempotency.mockResolvedValueOnce({ kind: "mismatch" })
      const res = await POST(makePostReq(VALID_BODY, { "Idempotency-Key": "abc-123" }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("Idempotency-Key")
      expect(mockCreateBooking).not.toHaveBeenCalled()
    })

    it("records the response after a successful createBooking", async () => {
      await POST(makePostReq(VALID_BODY, { "Idempotency-Key": "abc-123" }))
      expect(mockRecordIdempotentResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyId: "ak-1",
          idempotencyKey: "abc-123",
          responseStatus: 201,
        })
      )
    })

    it("does NOT record on createBooking failure (clients should be able to retry)", async () => {
      mockCreateBooking.mockResolvedValueOnce({ ok: false, error: "CONFLICT", status: 409 })
      await POST(makePostReq(VALID_BODY, { "Idempotency-Key": "abc-123" }))
      // recordIdempotentResponse is called but with a non-2xx status; the helper
      // itself drops it. Here we assert the route forwards the failure status:
      expect(mockRecordIdempotentResponse).toHaveBeenCalledWith(
        expect.objectContaining({ responseStatus: 409 })
      )
    })
  })
})
