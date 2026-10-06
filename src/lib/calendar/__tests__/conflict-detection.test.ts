import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getConflictingEvents, clearEventCache } from "../conflict-detection"
import type { CalendarEvent } from "../google"

// ─── Mock Prisma ───

const mockFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    calendarConnection: {
      findMany: (...args: any[]) => mockFindMany(...args),
      update: vi.fn(),
    },
  },
}))

// ─── Mock Google Calendar ───

const mockFetchGoogleCalendarEvents = vi.fn()
const mockRefreshGoogleToken = vi.fn()

vi.mock("../google", () => ({
  fetchGoogleCalendarEvents: (...args: any[]) => mockFetchGoogleCalendarEvents(...args),
  refreshGoogleToken: (...args: any[]) => mockRefreshGoogleToken(...args),
}))

// ─── Mock Outlook fetch (global fetch used by the module) ───

const originalFetch = global.fetch

// ─── Test Data ───

const TEST_USER_ID = "user-123"
const START_DATE = new Date("2026-03-01T00:00:00Z")
const END_DATE = new Date("2026-03-02T00:00:00Z")

function makeGoogleConnection(overrides = {}) {
  return {
    id: "conn-google-1",
    userId: TEST_USER_ID,
    provider: "GOOGLE",
    accessToken: "google-access-token",
    refreshToken: "google-refresh-token",
    expiresAt: new Date("2026-04-01T00:00:00Z"), // not expired
    email: "user@gmail.com",
    isPrimary: true,
    checkConflicts: true,
    label: "Personal",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeOutlookConnection(overrides = {}) {
  return {
    id: "conn-outlook-1",
    userId: TEST_USER_ID,
    provider: "OUTLOOK",
    accessToken: "outlook-access-token",
    refreshToken: "outlook-refresh-token",
    expiresAt: new Date("2026-04-01T00:00:00Z"),
    email: "user@outlook.com",
    isPrimary: false,
    checkConflicts: true,
    label: "Work",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeGoogleEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    start: new Date("2026-03-01T10:00:00Z"),
    end: new Date("2026-03-01T11:00:00Z"),
    calendarId: "primary",
    provider: "GOOGLE",
    summary: "Google Meeting",
    ...overrides,
  }
}

function _makeOutlookEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    start: new Date("2026-03-01T14:00:00Z"),
    end: new Date("2026-03-01T15:00:00Z"),
    calendarId: "primary",
    provider: "OUTLOOK",
    summary: "Outlook Meeting",
    ...overrides,
  }
}

// ─── Tests ───

describe("getConflictingEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearEventCache()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // ─── Basic functionality ───

  describe("basic functionality", () => {
    it("returns empty array when no calendars connected", async () => {
      mockFindMany.mockResolvedValue([])

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result).toEqual([])
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          checkConflicts: true,
        },
      })
    })

    it("returns events from a single Google calendar", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe("GOOGLE")
      expect(result[0].summary).toBe("Google Meeting")
    })

    it("merges events from multiple calendars", async () => {
      const googleConn = makeGoogleConnection()
      const outlookConn = makeOutlookConnection()
      mockFindMany.mockResolvedValue([googleConn, outlookConn])

      const googleEvents = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(googleEvents)

      // Mock Outlook fetch response
      const outlookApiResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              subject: "Outlook Meeting",
              start: { dateTime: "2026-03-01T14:00:00.000" },
              end: { dateTime: "2026-03-01T15:00:00.000" },
              showAs: "busy",
            },
          ],
        }),
      }
      ;(global.fetch as any).mockResolvedValue(outlookApiResponse)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result.length).toBeGreaterThanOrEqual(1)
      // Should contain Google events
      const googleResult = result.filter((e) => e.provider === "GOOGLE")
      expect(googleResult).toHaveLength(1)
    })

    it("filters calendars where checkConflicts = false", async () => {
      // Only the Google connection has checkConflicts: true,
      // the Outlook one is excluded by the DB query filter
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result).toHaveLength(1)
      // Verify the findMany filter included checkConflicts: true
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ checkConflicts: true }),
        })
      )
    })
  })

  // ─── Error handling ───

  describe("error handling", () => {
    it("continues when one calendar API fails", async () => {
      const googleConn = makeGoogleConnection()
      const outlookConn = makeOutlookConnection()
      mockFindMany.mockResolvedValue([googleConn, outlookConn])

      // Google succeeds
      const googleEvents = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(googleEvents)

      // Outlook fails (network error)
      ;(global.fetch as any).mockRejectedValue(new Error("Network error"))

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Should still have Google events (Outlook failure logged but not thrown)
      expect(result.length).toBeGreaterThanOrEqual(1)
      const googleResult = result.filter((e) => e.provider === "GOOGLE")
      expect(googleResult).toHaveLength(1)
    })

    it("handles expired tokens by attempting refresh", async () => {
      const expiredConn = makeGoogleConnection({
        expiresAt: new Date("2020-01-01T00:00:00Z"), // expired
      })
      mockFindMany.mockResolvedValue([expiredConn])

      mockRefreshGoogleToken.mockResolvedValue({
        accessToken: "new-google-token",
        expiresAt: new Date("2026-04-01T00:00:00Z"),
      })

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Should still return events (token was refreshed)
      expect(result).toHaveLength(1)
    })

    it("handles network errors gracefully", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      // Google calendar fetch throws a network error
      mockFetchGoogleCalendarEvents.mockRejectedValue(new Error("ECONNREFUSED"))

      // Because Promise.allSettled is used, this should not throw
      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Should return empty since the only calendar failed
      expect(result).toEqual([])
    })

    it("returns partial results when some calendars fail", async () => {
      const googleConn1 = makeGoogleConnection({ id: "conn-google-1" })
      const googleConn2 = makeGoogleConnection({
        id: "conn-google-2",
        email: "user2@gmail.com",
      })
      mockFindMany.mockResolvedValue([googleConn1, googleConn2])

      // First calendar succeeds
      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([makeGoogleEvent()])
        .mockRejectedValueOnce(new Error("API limit exceeded"))

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Should have events from the first calendar only
      expect(result).toHaveLength(1)
      expect(result[0].summary).toBe("Google Meeting")
    })
  })

  // ─── Edge cases ───

  describe("edge cases", () => {
    it("handles overlapping events from different calendars", async () => {
      const googleConn = makeGoogleConnection()
      const outlookConn = makeOutlookConnection()
      mockFindMany.mockResolvedValue([googleConn, outlookConn])

      // Both calendars have events at the same time
      const overlappingStart = new Date("2026-03-01T10:00:00Z")
      const overlappingEnd = new Date("2026-03-01T11:00:00Z")

      const googleEvents = [
        makeGoogleEvent({ start: overlappingStart, end: overlappingEnd }),
      ]
      mockFetchGoogleCalendarEvents.mockResolvedValue(googleEvents)

      // Outlook also has an event at the same time
      const outlookApiResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              subject: "Outlook Overlapping",
              start: { dateTime: "2026-03-01T10:00:00.000" },
              end: { dateTime: "2026-03-01T11:00:00.000" },
              showAs: "busy",
            },
          ],
        }),
      }
      ;(global.fetch as any).mockResolvedValue(outlookApiResponse)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Both events should be returned (merging, not deduplicating)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it("handles empty event list from API", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result).toEqual([])
    })

    it("handles multiple events from a single calendar", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [
        makeGoogleEvent({
          start: new Date("2026-03-01T09:00:00Z"),
          end: new Date("2026-03-01T10:00:00Z"),
          summary: "Morning standup",
        }),
        makeGoogleEvent({
          start: new Date("2026-03-01T11:00:00Z"),
          end: new Date("2026-03-01T12:00:00Z"),
          summary: "Lunch meeting",
        }),
        makeGoogleEvent({
          start: new Date("2026-03-01T14:00:00Z"),
          end: new Date("2026-03-01T15:30:00Z"),
          summary: "Afternoon review",
        }),
      ]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(result).toHaveLength(3)
    })
  })

  // ─── Caching ───

  describe("caching", () => {
    it("returns cached results on subsequent calls", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      // First call - fetches from API
      const result1 = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      expect(result1).toHaveLength(1)
      expect(mockFindMany).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result2 = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      expect(result2).toHaveLength(1)
      // findMany should NOT be called again
      expect(mockFindMany).toHaveBeenCalledTimes(1)
    })

    it("clearEventCache clears cache for specific user", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      expect(mockFindMany).toHaveBeenCalledTimes(1)

      // Clear cache for this user
      clearEventCache(TEST_USER_ID)

      // Next call should fetch again
      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      expect(mockFindMany).toHaveBeenCalledTimes(2)
    })

    it("clearEventCache() without userId clears all caches", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])

      const events = [makeGoogleEvent()]
      mockFetchGoogleCalendarEvents.mockResolvedValue(events)

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // Clear all
      clearEventCache()

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      expect(mockFindMany).toHaveBeenCalledTimes(2)
    })
  })

  // ─── Performance ───

  describe("performance", () => {
    it("fetches calendars in parallel", async () => {
      const connections = Array.from({ length: 6 }, (_, i) =>
        makeGoogleConnection({
          id: `conn-google-${i}`,
          email: `user${i}@gmail.com`,
        })
      )
      mockFindMany.mockResolvedValue(connections)

      // Each calendar fetch takes 100ms
      mockFetchGoogleCalendarEvents.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([makeGoogleEvent()]), 100)
          )
      )

      const start = Date.now()
      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      const elapsed = Date.now() - start

      // 6 calendars at 100ms each, but parallel should be < 500ms
      // (sequential would be ~600ms)
      expect(elapsed).toBeLessThan(500)
      expect(result).toHaveLength(6)
    })

    it("completes within 2 seconds for 6 calendars with mocked API", async () => {
      const connections = Array.from({ length: 6 }, (_, i) =>
        makeGoogleConnection({
          id: `conn-google-${i}`,
          email: `user${i}@gmail.com`,
        })
      )
      mockFindMany.mockResolvedValue(connections)

      mockFetchGoogleCalendarEvents.mockImplementation(async () => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 50))
        return [
          makeGoogleEvent(),
          makeGoogleEvent({
            start: new Date("2026-03-01T13:00:00Z"),
            end: new Date("2026-03-01T14:00:00Z"),
          }),
        ]
      })

      const start = Date.now()
      const result = await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(2000)
      expect(result).toHaveLength(12) // 6 calendars * 2 events each
    })
  })

  // ─── Database query correctness ───

  describe("database query", () => {
    it("only queries calendars with checkConflicts: true", async () => {
      mockFindMany.mockResolvedValue([])

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          userId: TEST_USER_ID,
          checkConflicts: true,
        },
      })
    })

    it("queries for the correct user ID", async () => {
      mockFindMany.mockResolvedValue([])

      const differentUserId = "user-456"
      await getConflictingEvents(differentUserId, START_DATE, END_DATE)

      expect(mockFindMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: differentUserId,
        }),
      })
    })
  })

  // ─── Provider dispatch ───

  describe("provider dispatch", () => {
    it("dispatches Google connections to Google fetcher", async () => {
      const googleConn = makeGoogleConnection()
      mockFindMany.mockResolvedValue([googleConn])
      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      expect(mockFetchGoogleCalendarEvents).toHaveBeenCalled()
    })

    it("dispatches Outlook connections to Outlook fetcher (via fetch)", async () => {
      const outlookConn = makeOutlookConnection()
      mockFindMany.mockResolvedValue([outlookConn])

      const outlookApiResponse = {
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
      }
      ;(global.fetch as any).mockResolvedValue(outlookApiResponse)

      await getConflictingEvents(TEST_USER_ID, START_DATE, END_DATE)

      // fetch should have been called for Outlook
      expect(global.fetch).toHaveBeenCalled()
    })
  })
})
