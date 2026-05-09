import { describe, it, expect, vi, beforeEach } from "vitest"
import { createBooking } from "../create"

const mockEventTypeFindUnique = vi.fn()
const mockBookingCreate = vi.fn()
const mockContactUpsert = vi.fn()
const mockCalendarConnectionFindFirst = vi.fn()
const mockHasBookingConflict = vi.fn()
const mockCreateGoogleCalendarEvent = vi.fn()
const mockCreateZoomMeeting = vi.fn()
const mockCreateOutlookCalendarEvent = vi.fn()
const mockSendEmail = vi.fn()
const mockTriggerWebhooks = vi.fn()
const mockBuildBookingPayload = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    eventType: { findUnique: (...args: any[]) => mockEventTypeFindUnique(...args) },
    booking: { create: (...args: any[]) => mockBookingCreate(...args) },
    contact: { upsert: (...args: any[]) => mockContactUpsert(...args) },
    calendarConnection: { findFirst: (...args: any[]) => mockCalendarConnectionFindFirst(...args) },
  },
}))

vi.mock("@/lib/bookings/conflict-check", () => ({
  hasBookingConflict: (...args: any[]) => mockHasBookingConflict(...args),
}))

vi.mock("@/lib/calendar/google", () => ({
  createGoogleCalendarEvent: (...args: any[]) => mockCreateGoogleCalendarEvent(...args),
}))

vi.mock("@/lib/calendar/outlook", () => ({
  createOutlookCalendarEvent: (...args: any[]) => mockCreateOutlookCalendarEvent(...args),
}))

vi.mock("@/lib/video", () => ({
  createZoomMeeting: (...args: any[]) => mockCreateZoomMeeting(...args),
}))

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  bookingConfirmationEmail: () => "<html>",
}))

vi.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (...args: any[]) => mockTriggerWebhooks(...args),
}))

vi.mock("@/lib/webhooks/booking-payload", () => ({
  buildBookingPayload: (...args: any[]) => mockBuildBookingPayload(...args),
}))

const HOST = { id: "host-1", name: "Sze", email: "sze@example.com" }
const SOLO_EVENT_TYPE = {
  id: "et-1",
  userId: "host-1",
  title: "Discovery",
  slug: "discovery",
  duration: 30,
  location: "GOOGLE_MEET",
  isCollective: false,
  collectiveMembers: [],
  requirePayment: false,
  user: HOST,
} as any

const VALID_INPUT = {
  eventTypeId: "et-1",
  startTime: new Date("2026-06-01T15:00:00Z"),
  bookerName: "Alex",
  bookerEmail: "alex@example.com",
  bookerTimezone: "America/Los_Angeles",
}

describe("createBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventTypeFindUnique.mockResolvedValue(SOLO_EVENT_TYPE)
    mockHasBookingConflict.mockResolvedValue(false)
    mockCreateGoogleCalendarEvent.mockResolvedValue({ id: "cal-1", meetingUrl: "https://meet/x" })
    mockBookingCreate.mockResolvedValue({
      id: "bk-1",
      uid: "uid-1",
      meetingUrl: "https://meet/x",
      bookerName: "Alex",
      bookerEmail: "alex@example.com",
    })
    mockContactUpsert.mockResolvedValue({})
    mockSendEmail.mockResolvedValue({})
    mockBuildBookingPayload.mockResolvedValue({ booking: {}, eventType: {}, host: {} })
    mockCalendarConnectionFindFirst.mockResolvedValue(null)
    mockTriggerWebhooks.mockResolvedValue({})
  })

  describe("error paths", () => {
    it("returns EVENT_TYPE_NOT_FOUND when event type missing", async () => {
      mockEventTypeFindUnique.mockResolvedValueOnce(null)
      const result = await createBooking(VALID_INPUT)
      expect(result).toEqual({ ok: false, error: "EVENT_TYPE_NOT_FOUND", status: 404 })
    })

    it("returns CONFLICT when slot is taken", async () => {
      mockHasBookingConflict.mockResolvedValueOnce(true)
      const result = await createBooking(VALID_INPUT)
      expect(result).toEqual({ ok: false, error: "CONFLICT", status: 409 })
      expect(mockBookingCreate).not.toHaveBeenCalled()
    })

    it("returns FORBIDDEN when requireOwnerUserId doesn't match", async () => {
      const result = await createBooking({
        ...VALID_INPUT,
        requireOwnerUserId: "someone-else",
      })
      expect(result).toEqual({ ok: false, error: "FORBIDDEN", status: 403 })
      expect(mockBookingCreate).not.toHaveBeenCalled()
    })

    it("succeeds when requireOwnerUserId matches the event type owner", async () => {
      const result = await createBooking({
        ...VALID_INPUT,
        requireOwnerUserId: "host-1",
      })
      expect(result.ok).toBe(true)
    })
  })

  describe("happy path", () => {
    it("creates the booking with derived endTime and meeting link", async () => {
      const result = await createBooking(VALID_INPUT)
      expect(result.ok).toBe(true)
      expect(mockBookingCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventTypeId: "et-1",
            userId: "host-1",
            startTime: VALID_INPUT.startTime,
            endTime: new Date("2026-06-01T15:30:00Z"), // +30min from event type
            meetingUrl: "https://meet/x",
            meetingId: "cal-1",
            status: "CONFIRMED",
          }),
        })
      )
    })

    it("sets status PENDING when event type requires payment", async () => {
      mockEventTypeFindUnique.mockResolvedValueOnce({ ...SOLO_EVENT_TYPE, requirePayment: true })
      await createBooking(VALID_INPUT)
      expect(mockBookingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) })
      )
    })

    it("upserts the contact for this booker", async () => {
      await createBooking(VALID_INPUT)
      expect(mockContactUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_email: { userId: "host-1", email: "alex@example.com" } },
        })
      )
    })

    it("triggers booking.created webhook with normalized payload", async () => {
      await createBooking(VALID_INPUT)
      expect(mockBuildBookingPayload).toHaveBeenCalledWith("bk-1")
      expect(mockTriggerWebhooks).toHaveBeenCalledWith(
        "host-1",
        "booking.created",
        expect.any(Object)
      )
    })

    it("sends a Zoom-style meeting link when location is ZOOM", async () => {
      mockEventTypeFindUnique.mockResolvedValueOnce({ ...SOLO_EVENT_TYPE, location: "ZOOM" })
      mockCreateZoomMeeting.mockResolvedValueOnce({ id: "zm-1", url: "https://zoom/x" })
      await createBooking(VALID_INPUT)
      expect(mockCreateGoogleCalendarEvent).not.toHaveBeenCalled()
      expect(mockBookingCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meetingUrl: "https://zoom/x", meetingId: "zm-1" }),
        })
      )
    })

    it("emits no meeting URL for IN_PERSON / PHONE", async () => {
      mockEventTypeFindUnique.mockResolvedValueOnce({ ...SOLO_EVENT_TYPE, location: "IN_PERSON" })
      await createBooking(VALID_INPUT)
      expect(mockBookingCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meetingUrl: undefined, meetingId: undefined }),
        })
      )
    })

    it("creates an Outlook calendar event when one is connected and location isn't GOOGLE_MEET", async () => {
      mockEventTypeFindUnique.mockResolvedValueOnce({ ...SOLO_EVENT_TYPE, location: "ZOOM" })
      mockCreateZoomMeeting.mockResolvedValueOnce({ id: "zm-1", url: "https://zoom/x" })
      mockCalendarConnectionFindFirst.mockResolvedValueOnce({ id: "outlook-conn" })

      await createBooking(VALID_INPUT)
      expect(mockCreateOutlookCalendarEvent).toHaveBeenCalled()
    })

    it("does NOT create an Outlook event for GOOGLE_MEET bookings", async () => {
      await createBooking(VALID_INPUT)
      expect(mockCreateOutlookCalendarEvent).not.toHaveBeenCalled()
    })
  })
})
