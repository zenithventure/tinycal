import { describe, it, expect, vi, beforeEach } from "vitest"
import { createBooking } from "../create"

const mockEventTypeFindUnique = vi.fn()
const mockBookingCreate = vi.fn()
const mockContactUpsert = vi.fn()
const mockCalendarConnectionFindFirst = vi.fn()
const mockUserFindMany = vi.fn()
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
    user: { findMany: (...args: any[]) => mockUserFindMany(...args) },
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
    mockUserFindMany.mockResolvedValue([])
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

  describe("collective event types (Google Meet)", () => {
    const COLLECTIVE_EVENT_TYPE = {
      ...SOLO_EVENT_TYPE,
      isCollective: true,
      collectiveMembers: ["cohost-1", "cohost-2"],
    }

    beforeEach(() => {
      mockEventTypeFindUnique.mockResolvedValue(COLLECTIVE_EVENT_TYPE)
      mockUserFindMany.mockResolvedValue([
        { email: "cohost1@example.com" },
        { email: "cohost2@example.com" },
      ])
    })

    it("includes every co-host email as a Google attendee on the owner's event", async () => {
      await createBooking(VALID_INPUT)
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledWith(
        "host-1",
        expect.objectContaining({
          attendees: [
            { email: "alex@example.com" },
            { email: "cohost1@example.com" },
            { email: "cohost2@example.com" },
          ],
          conferenceData: true,
        })
      )
    })

    it("resolves co-host emails by querying the collectiveMembers ids", async () => {
      await createBooking(VALID_INPUT)
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: { id: { in: ["cohost-1", "cohost-2"] } },
        select: { email: true },
      })
    })

    it("drops co-hosts that have no email on record from the attendee list", async () => {
      mockUserFindMany.mockResolvedValue([
        { email: "cohost1@example.com" },
        { email: null },
      ])
      await createBooking(VALID_INPUT)
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledWith(
        "host-1",
        expect.objectContaining({
          attendees: [
            { email: "alex@example.com" },
            { email: "cohost1@example.com" },
          ],
        })
      )
    })

    it("sends a host confirmation email to the owner AND every co-host", async () => {
      await createBooking(VALID_INPUT)
      const hostEmailRecipients = mockSendEmail.mock.calls
        .map((c) => c[0]?.to)
        .filter((to) => to !== "alex@example.com") // drop the booker's email
      expect(hostEmailRecipients).toEqual(
        expect.arrayContaining([
          "sze@example.com",
          "cohost1@example.com",
          "cohost2@example.com",
        ])
      )
      expect(hostEmailRecipients).toHaveLength(3)
    })

    it("deduplicates the host email recipient list if a co-host is also the owner", async () => {
      mockUserFindMany.mockResolvedValue([
        { email: "sze@example.com" }, // same as owner
        { email: "cohost2@example.com" },
      ])
      await createBooking(VALID_INPUT)
      const hostEmailRecipients = mockSendEmail.mock.calls
        .map((c) => c[0]?.to)
        .filter((to) => to !== "alex@example.com")
      expect(hostEmailRecipients.sort()).toEqual(
        ["cohost2@example.com", "sze@example.com"].sort()
      )
    })

    it("does NOT query users or pad attendees for non-collective event types", async () => {
      mockEventTypeFindUnique.mockResolvedValue(SOLO_EVENT_TYPE)
      await createBooking(VALID_INPUT)
      expect(mockUserFindMany).not.toHaveBeenCalled()
      expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledWith(
        "host-1",
        expect.objectContaining({
          attendees: [{ email: "alex@example.com" }],
        })
      )
    })
  })
})
