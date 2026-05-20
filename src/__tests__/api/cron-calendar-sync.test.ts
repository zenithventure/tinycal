import { describe, it, expect, vi, beforeEach } from "vitest"

const mockBookingFindMany = vi.fn()
const mockBookingUpdate = vi.fn()
const mockGetGoogleCalendarEvent = vi.fn()
const mockSendEmail = vi.fn()
const mockTriggerWebhooks = vi.fn()
const mockBuildBookingPayload = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    booking: {
      findMany: (...args: any[]) => mockBookingFindMany(...args),
      update: (...args: any[]) => mockBookingUpdate(...args),
    },
  },
}))

vi.mock("@/lib/calendar/google", () => ({
  getGoogleCalendarEvent: (...args: any[]) => mockGetGoogleCalendarEvent(...args),
}))

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  bookingCancelledEmail: ({ reason }: { reason: string }) => `cancelled-email:${reason}`,
}))

vi.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (...args: any[]) => mockTriggerWebhooks(...args),
}))

vi.mock("@/lib/webhooks/booking-payload", () => ({
  buildBookingPayload: (...args: any[]) => mockBuildBookingPayload(...args),
}))

import { GET } from "@/app/api/cron/calendar-sync/route"

const SECRET = "test-cron-secret"

function makeReq(token = SECRET): Request {
  return new Request("http://localhost/api/cron/calendar-sync", {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeBooking(overrides: Partial<any> = {}) {
  return {
    id: "b-1",
    uid: "u-1",
    userId: "user-1",
    title: "Intro call",
    startTime: new Date("2026-06-01T10:00:00Z"),
    endTime: new Date("2026-06-01T10:30:00Z"),
    bookerName: "Alex Booker",
    bookerEmail: "booker@example.com",
    bookerTimezone: "America/New_York",
    meetingId: "google-event-1",
    location: "GOOGLE_MEET",
    eventType: {
      user: { email: "host@example.com", name: "Host" },
    },
    ...overrides,
  }
}

describe("GET /api/cron/calendar-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = SECRET
    mockBookingUpdate.mockResolvedValue({})
    mockSendEmail.mockResolvedValue({})
    mockBuildBookingPayload.mockResolvedValue({ event: "booking.cancelled" })
    mockTriggerWebhooks.mockResolvedValue(undefined)
  })

  it("returns 401 without the cron secret", async () => {
    const res = await GET(new Request("http://x/api/cron/calendar-sync"))
    expect(res.status).toBe(401)
  })

  it("returns 401 with the wrong cron secret", async () => {
    const res = await GET(makeReq("wrong"))
    expect(res.status).toBe(401)
  })

  it("returns zeros when no bookings match", async () => {
    mockBookingFindMany.mockResolvedValueOnce([])
    const res = await GET(makeReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ processed: 0, cancelled: 0, rescheduled: 0, unchanged: 0, skipped: 0, errored: 0 })
  })

  it("cancels the booking when Google returns status=cancelled", async () => {
    mockBookingFindMany.mockResolvedValueOnce([makeBooking()])
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "cancelled" })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, cancelled: 1 })
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: "b-1" },
      data: { status: "CANCELLED", cancelReason: "Cancelled in calendar" },
    })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockTriggerWebhooks).toHaveBeenCalledWith("user-1", "booking.cancelled", expect.any(Object))
  })

  it("cancels the booking when Google returns 410 (gone)", async () => {
    mockBookingFindMany.mockResolvedValueOnce([makeBooking()])
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "gone" })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, cancelled: 1 })
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: "b-1" },
      data: { status: "CANCELLED", cancelReason: "Deleted from calendar" },
    })
    expect(mockTriggerWebhooks).toHaveBeenCalledWith("user-1", "booking.cancelled", expect.any(Object))
  })

  it("skips the booking when Google returns 404 (not_found) without cancelling", async () => {
    mockBookingFindMany.mockResolvedValueOnce([makeBooking()])
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "not_found" })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, skipped: 1, cancelled: 0 })
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("reports errored when Google lookup fails", async () => {
    mockBookingFindMany.mockResolvedValueOnce([makeBooking()])
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "error", reason: "boom" })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, errored: 1 })
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  it("reschedules the booking when Google times changed", async () => {
    mockBookingFindMany.mockResolvedValueOnce([makeBooking()])
    const newStart = new Date("2026-06-01T11:00:00Z")
    const newEnd = new Date("2026-06-01T11:30:00Z")
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "ok", start: newStart, end: newEnd })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, rescheduled: 1 })
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: "b-1" },
      data: { startTime: newStart, endTime: newEnd },
    })
  })

  it("counts as unchanged when times match", async () => {
    const booking = makeBooking()
    mockBookingFindMany.mockResolvedValueOnce([booking])
    mockGetGoogleCalendarEvent.mockResolvedValueOnce({ status: "ok", start: booking.startTime, end: booking.endTime })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, unchanged: 1 })
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  it("scans bookings up to 90 days in the future so far-out deletions are caught", async () => {
    mockBookingFindMany.mockResolvedValueOnce([])
    await GET(makeReq())
    const where = mockBookingFindMany.mock.calls[0][0].where
    const lookahead = where.endTime.lte.getTime() - Date.now()
    // Allow 1 day slack on either side; the contract is "well past the previous 14-day cap".
    expect(lookahead).toBeGreaterThan(60 * 24 * 60 * 60 * 1000)
    expect(lookahead).toBeLessThan(95 * 24 * 60 * 60 * 1000)
  })
})
