import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock googleapis ──────────────────────────────────────────────────────────
//
// We mock at the SDK boundary so we can assert exactly what payload reaches
// calendar.events.insert. The reviewer flagged that without sendUpdates: "all"
// Google silently skips attendee notification + external-calendar sync, which
// would defeat the collective co-host invite path. This file pins the behavior.

const mockEventsInsert = vi.fn()
const mockEventsPatch = vi.fn()
const mockFreebusyQuery = vi.fn()
const mockCalendarFactory = vi.fn(() => ({
  events: { insert: mockEventsInsert, patch: mockEventsPatch },
  freebusy: { query: mockFreebusyQuery },
}))

vi.mock("googleapis", () => ({
  google: {
    calendar: (...args: any[]) => mockCalendarFactory(...args),
    auth: {
      // Inline class — vi.mock factories are hoisted above the file body, so
      // declaring this at module scope would hit a TDZ error at import time.
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
  },
}))

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockConnectionFindFirst = vi.fn()

vi.mock("../../prisma", () => ({
  default: {
    calendarConnection: {
      findFirst: (...args: any[]) => mockConnectionFindFirst(...args),
      update: vi.fn(),
    },
  },
}))

// Import the SUT AFTER the mocks above so its module-level `import { google }`
// resolves to our stub.
import { createGoogleCalendarEvent } from "../google"

describe("createGoogleCalendarEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectionFindFirst.mockResolvedValue({
      id: "conn-1",
      userId: "host-1",
      provider: "GOOGLE",
      accessToken: "at",
      refreshToken: "rt",
      isPrimary: true,
    })
    mockEventsInsert.mockResolvedValue({
      data: { id: "evt-1", hangoutLink: "https://meet/x" },
    })
  })

  it('passes sendUpdates: "all" so Google emails every attendee and syncs the event onto their calendars', async () => {
    await createGoogleCalendarEvent("host-1", {
      summary: "Collective sync",
      startTime: new Date("2026-06-01T15:00:00Z"),
      endTime: new Date("2026-06-01T15:30:00Z"),
      attendees: [
        { email: "alex@example.com" },
        { email: "cohost1@example.com" },
        { email: "cohost2@example.com" },
      ],
      conferenceData: true,
    })

    expect(mockEventsInsert).toHaveBeenCalledTimes(1)
    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        sendUpdates: "all",
        conferenceDataVersion: 1,
        requestBody: expect.objectContaining({
          attendees: [
            { email: "alex@example.com" },
            { email: "cohost1@example.com" },
            { email: "cohost2@example.com" },
          ],
        }),
      })
    )
  })

  it("still includes sendUpdates: \"all\" when conferenceData is omitted", async () => {
    await createGoogleCalendarEvent("host-1", {
      summary: "Phone call",
      startTime: new Date("2026-06-01T15:00:00Z"),
      endTime: new Date("2026-06-01T15:30:00Z"),
      attendees: [{ email: "alex@example.com" }],
    })

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ sendUpdates: "all", conferenceDataVersion: 0 })
    )
  })

  it("returns null without calling insert when the host has no Google connection", async () => {
    mockConnectionFindFirst.mockResolvedValueOnce(null)
    const result = await createGoogleCalendarEvent("host-1", {
      summary: "x",
      startTime: new Date(),
      endTime: new Date(),
      attendees: [],
    })
    expect(result).toBeNull()
    expect(mockEventsInsert).not.toHaveBeenCalled()
  })
})
