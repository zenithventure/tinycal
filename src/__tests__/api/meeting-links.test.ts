import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock Data ───

const TEST_USER = {
  id: "user-host-123",
  name: "Alice Host",
  email: "alice@example.com",
  timezone: "America/New_York",
  brandColor: "#2563eb",
  slug: "alice",
  image: null,
  plan: "FREE",
}

const TEST_EVENT_TYPE = {
  id: "et-123",
  userId: TEST_USER.id,
  title: "30 Minute Meeting",
  slug: "30min",
  duration: 30,
  location: "GOOGLE_MEET",
  active: true,
  bufferBefore: 0,
  bufferAfter: 0,
  requirePayment: false,
  user: TEST_USER,
}

const TEST_BOOKING = {
  id: "booking-id-123",
  uid: "booking-uid-abc",
  eventTypeId: TEST_EVENT_TYPE.id,
  userId: TEST_USER.id,
  title: "30 Minute Meeting",
  startTime: new Date("2026-04-15T14:00:00Z"),
  endTime: new Date("2026-04-15T14:30:00Z"),
  status: "PENDING_CONFIRMATION",
  source: "MEETING_LINK",
  bookerName: "Pending",
  bookerEmail: "",
  bookerTimezone: "America/New_York",
  bookerPhone: null,
  location: "GOOGLE_MEET",
  meetingUrl: "https://meet.google.com/abc-def-ghi",
  meetingId: "cal-event-123",
  recipientNote: "Looking forward to our chat!",
  confirmedAt: null,
  paid: false,
  paymentAmount: null,
  cancelReason: null,
  rescheduleUid: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  eventType: { ...TEST_EVENT_TYPE, user: TEST_USER },
  user: TEST_USER,
}

// ─── Mocks ───

const mockGetAuthenticatedUser = vi.fn()
const mockPrisma = {
  eventType: { findFirst: vi.fn(), findUnique: vi.fn() },
  booking: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  contact: { upsert: vi.fn() },
  calendarConnection: { findFirst: vi.fn() },
}
const mockCreateGoogleCalendarEvent = vi.fn()
const mockCreateOutlookCalendarEvent = vi.fn()
const mockUpdateGoogleCalendarEvent = vi.fn()
const mockCreateZoomMeeting = vi.fn()
const mockSendEmail = vi.fn()
const mockTriggerWebhooks = vi.fn()

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

vi.mock("@/lib/prisma", () => ({
  default: mockPrisma,
}))

vi.mock("@/lib/calendar/google", () => ({
  createGoogleCalendarEvent: (...args: any[]) => mockCreateGoogleCalendarEvent(...args),
  updateGoogleCalendarEvent: (...args: any[]) => mockUpdateGoogleCalendarEvent(...args),
}))

vi.mock("@/lib/calendar/outlook", () => ({
  createOutlookCalendarEvent: (...args: any[]) => mockCreateOutlookCalendarEvent(...args),
  updateOutlookCalendarEvent: vi.fn(),
}))

vi.mock("@/lib/video", () => ({
  createZoomMeeting: (...args: any[]) => mockCreateZoomMeeting(...args),
}))

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  bookingConfirmationEmail: vi.fn().mockReturnValue("<html>confirmation</html>"),
  meetingLinkInvitationEmail: vi.fn().mockReturnValue("<html>invitation</html>"),
}))

vi.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (...args: any[]) => mockTriggerWebhooks(...args),
}))

// ─── Helpers ───

function makeRequest(body: any): Request {
  return new Request("http://localhost/api/meeting-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(url: string): Request {
  return new Request(url, { method: "GET" })
}

// ─── Setup ───

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  mockGetAuthenticatedUser.mockResolvedValue(TEST_USER)
  mockPrisma.eventType.findFirst.mockResolvedValue(TEST_EVENT_TYPE)
  mockPrisma.booking.findFirst.mockResolvedValue(null) // no conflicts
  mockPrisma.booking.create.mockResolvedValue(TEST_BOOKING)
  mockPrisma.booking.findUnique.mockResolvedValue(TEST_BOOKING)
  mockPrisma.booking.update.mockResolvedValue({ ...TEST_BOOKING, status: "CONFIRMED", confirmedAt: new Date() })
  mockPrisma.contact.upsert.mockResolvedValue({})
  mockPrisma.calendarConnection.findFirst.mockResolvedValue(null)
  mockCreateGoogleCalendarEvent.mockResolvedValue({ meetingUrl: "https://meet.google.com/abc", id: "cal-123" })
  mockSendEmail.mockResolvedValue(undefined)
  mockTriggerWebhooks.mockResolvedValue(undefined)
})

// ─── POST /api/meeting-links (Create Meeting Link) ───

describe("POST /api/meeting-links", () => {
  let handler: typeof import("@/app/api/meeting-links/route")

  beforeEach(async () => {
    handler = await import("@/app/api/meeting-links/route")
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
    const res = await handler.POST(makeRequest({ eventTypeId: "et-123", startTime: "2026-04-15T14:00:00Z" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when eventTypeId is missing", async () => {
    const res = await handler.POST(makeRequest({ startTime: "2026-04-15T14:00:00Z" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when startTime is missing", async () => {
    const res = await handler.POST(makeRequest({ eventTypeId: "et-123" }))
    expect(res.status).toBe(400)
  })

  it("returns 404 when event type not found", async () => {
    mockPrisma.eventType.findFirst.mockResolvedValue(null)
    const res = await handler.POST(makeRequest({ eventTypeId: "et-999", startTime: "2026-04-15T14:00:00Z" }))
    expect(res.status).toBe(404)
  })

  it("returns 409 when time conflicts with existing booking", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: "existing-booking" })
    const res = await handler.POST(makeRequest({ eventTypeId: "et-123", startTime: "2026-04-15T14:00:00Z" }))
    expect(res.status).toBe(409)
  })

  it("creates a meeting link booking with PENDING_CONFIRMATION status", async () => {
    const res = await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.shareUrl).toContain("/m/")
    expect(body.booking).toBeDefined()

    // Verify booking was created with correct data
    expect(mockPrisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "PENDING_CONFIRMATION",
        source: "MEETING_LINK",
        eventTypeId: "et-123",
      }),
    })
  })

  it("creates Google Calendar event for GOOGLE_MEET location", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockCreateGoogleCalendarEvent).toHaveBeenCalledWith(
      TEST_USER.id,
      expect.objectContaining({
        conferenceData: true,
        startTime: new Date("2026-04-15T14:00:00Z"),
        endTime: new Date("2026-04-15T14:30:00Z"),
      })
    )
  })

  it("creates Zoom meeting for ZOOM location", async () => {
    mockPrisma.eventType.findFirst.mockResolvedValue({ ...TEST_EVENT_TYPE, location: "ZOOM" })
    mockCreateZoomMeeting.mockResolvedValue({ url: "https://zoom.us/j/123", id: "zoom-123" })

    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockCreateZoomMeeting).toHaveBeenCalled()
  })

  it("sends invitation email when recipientEmail is provided", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
      recipientName: "Bob",
      recipientEmail: "bob@example.com",
    }))

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
      })
    )
  })

  it("does not send email when recipientEmail is not provided", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("uses 'Pending' as bookerName when recipientName is not provided", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockPrisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookerName: "Pending",
        bookerEmail: "",
      }),
    })
  })

  it("stores recipient note", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
      recipientNote: "See you there!",
    }))

    expect(mockPrisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientNote: "See you there!",
      }),
    })
  })

  it("calculates endTime from eventType duration", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockPrisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startTime: new Date("2026-04-15T14:00:00Z"),
        endTime: new Date("2026-04-15T14:30:00Z"), // 30 min duration
      }),
    })
  })

  it("includes PENDING_CONFIRMATION in conflict check", async () => {
    await handler.POST(makeRequest({
      eventTypeId: "et-123",
      startTime: "2026-04-15T14:00:00Z",
    }))

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["CONFIRMED", "PENDING", "PENDING_CONFIRMATION"] },
        }),
      })
    )
  })
})

// ─── GET /api/meeting-links/[uid] (Get Details) ───

describe("GET /api/meeting-links/[uid]", () => {
  let handler: typeof import("@/app/api/meeting-links/[uid]/route")

  beforeEach(async () => {
    handler = await import("@/app/api/meeting-links/[uid]/route")
  })

  it("returns meeting details for valid uid", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...TEST_BOOKING,
      source: "MEETING_LINK",
      user: TEST_USER,
      eventType: TEST_EVENT_TYPE,
    })

    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/booking-uid-abc"),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uid).toBe("booking-uid-abc")
    expect(body.title).toBe("30 Minute Meeting")
  })

  it("returns 404 for non-existent uid", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null)
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/nonexistent"),
      { params: { uid: "nonexistent" } }
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 for non-MEETING_LINK bookings", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...TEST_BOOKING,
      source: "BOOKING_PAGE",
    })
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/booking-uid-abc"),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/meeting-links/[uid]/confirm (Confirm) ───

describe("POST /api/meeting-links/[uid]/confirm", () => {
  let handler: typeof import("@/app/api/meeting-links/[uid]/confirm/route")

  beforeEach(async () => {
    handler = await import("@/app/api/meeting-links/[uid]/confirm/route")
  })

  function makeConfirmRequest(body: any): Request {
    return new Request("http://localhost/api/meeting-links/booking-uid-abc/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("confirms a pending meeting link booking", async () => {
    const res = await handler.POST(
      makeConfirmRequest({
        name: "Bob Recipient",
        email: "bob@example.com",
        timezone: "Europe/London",
      }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(200)

    // Verify update
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { uid: "booking-uid-abc" },
      data: expect.objectContaining({
        bookerName: "Bob Recipient",
        bookerEmail: "bob@example.com",
        bookerTimezone: "Europe/London",
        status: "CONFIRMED",
        confirmedAt: expect.any(Date),
      }),
    })
  })

  it("creates a contact on confirmation", async () => {
    await handler.POST(
      makeConfirmRequest({
        name: "Bob Recipient",
        email: "bob@example.com",
        timezone: "Europe/London",
      }),
      { params: { uid: "booking-uid-abc" } }
    )

    expect(mockPrisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_email: { userId: TEST_USER.id, email: "bob@example.com" } },
        create: expect.objectContaining({
          name: "Bob Recipient",
          email: "bob@example.com",
          source: "meeting_link",
        }),
      })
    )
  })

  it("sends confirmation emails to both parties", async () => {
    await handler.POST(
      makeConfirmRequest({
        name: "Bob",
        email: "bob@example.com",
        timezone: "Europe/London",
      }),
      { params: { uid: "booking-uid-abc" } }
    )

    // Should send to recipient and host
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "bob@example.com" }))
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: TEST_USER.email }))
  })

  it("triggers webhooks on confirmation", async () => {
    await handler.POST(
      makeConfirmRequest({
        name: "Bob",
        email: "bob@example.com",
        timezone: "Europe/London",
      }),
      { params: { uid: "booking-uid-abc" } }
    )

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      TEST_USER.id,
      "booking.created",
      expect.any(Object)
    )
  })

  it("returns 400 when name is missing", async () => {
    const res = await handler.POST(
      makeConfirmRequest({ email: "bob@example.com", timezone: "UTC" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when email is missing", async () => {
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", timezone: "UTC" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when timezone is missing", async () => {
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", email: "bob@example.com" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 for non-existent booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null)
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", email: "bob@example.com", timezone: "UTC" }),
      { params: { uid: "nonexistent" } }
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 for non-MEETING_LINK bookings", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...TEST_BOOKING,
      source: "BOOKING_PAGE",
    })
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", email: "bob@example.com", timezone: "UTC" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(404)
  })

  it("returns 400 for already confirmed bookings", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...TEST_BOOKING,
      status: "CONFIRMED",
    })
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", email: "bob@example.com", timezone: "UTC" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 for cancelled bookings", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...TEST_BOOKING,
      status: "CANCELLED",
    })
    const res = await handler.POST(
      makeConfirmRequest({ name: "Bob", email: "bob@example.com", timezone: "UTC" }),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(400)
  })
})

// ─── GET /api/meeting-links/[uid]/ics (ICS Download) ───

describe("GET /api/meeting-links/[uid]/ics", () => {
  let handler: typeof import("@/app/api/meeting-links/[uid]/ics/route")

  beforeEach(async () => {
    handler = await import("@/app/api/meeting-links/[uid]/ics/route")
  })

  it("returns ICS file with correct content type", async () => {
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/booking-uid-abc/ics"),
      { params: { uid: "booking-uid-abc" } }
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/calendar")
    expect(res.headers.get("Content-Disposition")).toContain("attachment")
    expect(res.headers.get("Content-Disposition")).toContain(".ics")
  })

  it("includes correct event details in ICS", async () => {
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/booking-uid-abc/ics"),
      { params: { uid: "booking-uid-abc" } }
    )
    const body = await res.text()
    expect(body).toContain("BEGIN:VCALENDAR")
    expect(body).toContain("SUMMARY:30 Minute Meeting")
    expect(body).toContain("booking-uid-abc@tinycal")
  })

  it("includes organizer info from host", async () => {
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/booking-uid-abc/ics"),
      { params: { uid: "booking-uid-abc" } }
    )
    const body = await res.text()
    expect(body).toContain("ORGANIZER")
    expect(body).toContain("Alice Host")
    expect(body).toContain("alice@example.com")
  })

  it("returns 404 for non-existent booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null)
    const res = await handler.GET(
      makeGetRequest("http://localhost/api/meeting-links/nonexistent/ics"),
      { params: { uid: "nonexistent" } }
    )
    expect(res.status).toBe(404)
  })
})
