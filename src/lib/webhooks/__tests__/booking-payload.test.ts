import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildBookingPayload } from "../booking-payload"

const mockBookingFindUnique = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    booking: {
      findUnique: (...args: any[]) => mockBookingFindUnique(...args),
    },
  },
}))

const SAMPLE_BOOKING = {
  id: "bk-1",
  uid: "uid-1",
  status: "CONFIRMED",
  title: "Discovery",
  startTime: new Date("2026-06-01T15:00:00Z"),
  endTime: new Date("2026-06-01T15:30:00Z"),
  location: "GOOGLE_MEET",
  meetingUrl: "https://meet.google.com/abc",
  source: "BOOKING_PAGE",
  bookerName: "Alex",
  bookerEmail: "alex@example.com",
  bookerTimezone: "America/Los_Angeles",
  bookerPhone: "+15551234567",
  answers: { q_1: "answer" },
  cancelReason: null,
  confirmedAt: null,
  createdAt: new Date("2026-05-09T15:25:00Z"),
  eventType: {
    id: "et-1",
    slug: "discovery",
    title: "Discovery",
    duration: 30,
    isCollective: true,
    user: { id: "host-1", name: "Sze", email: "sze@example.com" },
  },
}

describe("buildBookingPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null for an unknown bookingId", async () => {
    mockBookingFindUnique.mockResolvedValue(null)
    expect(await buildBookingPayload("missing")).toBeNull()
  })

  it("includes eventType slug+title and host info", async () => {
    mockBookingFindUnique.mockResolvedValue(SAMPLE_BOOKING)
    const payload = await buildBookingPayload("bk-1")

    expect(payload).not.toBeNull()
    expect(payload!.eventType).toEqual({
      id: "et-1",
      slug: "discovery",
      title: "Discovery",
      duration: 30,
      isCollective: true,
    })
    expect(payload!.host).toEqual({
      id: "host-1",
      name: "Sze",
      email: "sze@example.com",
    })
  })

  it("serializes dates as ISO 8601 UTC", async () => {
    mockBookingFindUnique.mockResolvedValue(SAMPLE_BOOKING)
    const payload = await buildBookingPayload("bk-1")

    expect(payload!.booking.startTime).toBe("2026-06-01T15:00:00.000Z")
    expect(payload!.booking.endTime).toBe("2026-06-01T15:30:00.000Z")
    expect(payload!.booking.createdAt).toBe("2026-05-09T15:25:00.000Z")
  })

  it("includes booker phone, answers, and source", async () => {
    mockBookingFindUnique.mockResolvedValue(SAMPLE_BOOKING)
    const payload = await buildBookingPayload("bk-1")

    expect(payload!.booking.booker).toEqual({
      name: "Alex",
      email: "alex@example.com",
      timezone: "America/Los_Angeles",
      phone: "+15551234567",
    })
    expect(payload!.booking.answers).toEqual({ q_1: "answer" })
    expect(payload!.booking.source).toBe("BOOKING_PAGE")
  })

  it("does NOT include the previous block when previous times aren't passed", async () => {
    mockBookingFindUnique.mockResolvedValue(SAMPLE_BOOKING)
    const payload = await buildBookingPayload("bk-1")
    expect(payload!.previous).toBeUndefined()
  })

  it("includes previous block for booking.rescheduled", async () => {
    mockBookingFindUnique.mockResolvedValue(SAMPLE_BOOKING)
    const payload = await buildBookingPayload("bk-1", {
      previousStartTime: new Date("2026-06-01T14:00:00Z"),
      previousEndTime: new Date("2026-06-01T14:30:00Z"),
    })
    expect(payload!.previous).toEqual({
      startTime: "2026-06-01T14:00:00.000Z",
      endTime: "2026-06-01T14:30:00.000Z",
    })
  })

  it("does NOT leak internal fields (stripePaymentIntentId, meetingId)", async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...SAMPLE_BOOKING,
      stripePaymentIntentId: "pi_secret",
      meetingId: "internal-id",
    })
    const payload = await buildBookingPayload("bk-1")
    expect(JSON.stringify(payload)).not.toContain("pi_secret")
    expect(JSON.stringify(payload)).not.toContain("internal-id")
  })

  it("handles nulls for optional fields (phone, answers, cancelReason)", async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...SAMPLE_BOOKING,
      bookerPhone: null,
      answers: null,
      cancelReason: null,
    })
    const payload = await buildBookingPayload("bk-1")
    expect(payload!.booking.booker.phone).toBeNull()
    expect(payload!.booking.answers).toBeNull()
    expect(payload!.booking.cancelReason).toBeNull()
  })
})
