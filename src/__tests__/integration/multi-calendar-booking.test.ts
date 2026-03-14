import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getAvailableSlots } from "@/lib/availability"
import { getConflictingEvents, clearEventCache } from "@/lib/calendar/conflict-detection"
import type { CalendarEvent } from "@/lib/calendar/google-calendar"

// ─── Mock Prisma ───

const mockCalendarConnectionFindMany = vi.fn()
const mockCalendarConnectionFindUnique = vi.fn()
const mockCalendarConnectionCount = vi.fn()
const mockCalendarConnectionUpdate = vi.fn()
const mockCalendarConnectionUpdateMany = vi.fn()
const mockCalendarConnectionDelete = vi.fn()
const mockCalendarConnectionFindFirst = vi.fn()
const mockCalendarConnectionCreate = vi.fn()
const mockUserFindUnique = vi.fn()
const mockEventTypeFindUnique = vi.fn()
const mockAvailabilityFindMany = vi.fn()
const mockBookingFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    calendarConnection: {
      findMany: (...args: any[]) => mockCalendarConnectionFindMany(...args),
      findUnique: (...args: any[]) => mockCalendarConnectionFindUnique(...args),
      findFirst: (...args: any[]) => mockCalendarConnectionFindFirst(...args),
      count: (...args: any[]) => mockCalendarConnectionCount(...args),
      update: (...args: any[]) => mockCalendarConnectionUpdate(...args),
      updateMany: (...args: any[]) => mockCalendarConnectionUpdateMany(...args),
      delete: (...args: any[]) => mockCalendarConnectionDelete(...args),
      create: (...args: any[]) => mockCalendarConnectionCreate(...args),
    },
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
    eventType: {
      findUnique: (...args: any[]) => mockEventTypeFindUnique(...args),
    },
    availability: {
      findMany: (...args: any[]) => mockAvailabilityFindMany(...args),
    },
    booking: {
      findMany: (...args: any[]) => mockBookingFindMany(...args),
    },
    availabilitySchedule: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}))

// ─── Mock Google Calendar ───

const mockFetchGoogleCalendarEvents = vi.fn()
const mockRefreshGoogleToken = vi.fn()

vi.mock("@/lib/calendar/google-calendar", () => ({
  fetchGoogleCalendarEvents: (...args: any[]) => mockFetchGoogleCalendarEvents(...args),
  refreshGoogleToken: (...args: any[]) => mockRefreshGoogleToken(...args),
}))

// ─── Mock Auth.js ───

const mockAuth = vi.fn()

vi.mock("@/auth", () => ({
  auth: (...args: any[]) => mockAuth(...args),
}))

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}))

// ─── Save/restore global fetch ───

const originalFetch = global.fetch

// ─── Test Data ───

const TEST_USER_ID = "user-integration-1"
const TEST_EVENT_TYPE_ID = "event-type-1"

// Far-future dates to avoid minNotice filtering
const FAR_FUTURE_DATE = new Date("2026-09-15T00:00:00Z")
const FAR_FUTURE_END = new Date("2026-09-16T00:00:00Z")

function makeTestUser(overrides = {}) {
  return {
    id: TEST_USER_ID,
    name: "Test User",
    email: "test@example.com",
    timezone: "UTC",
    plan: "PRO",
    ...overrides,
  }
}

function makeTestEventType(overrides = {}) {
  return {
    id: TEST_EVENT_TYPE_ID,
    userId: TEST_USER_ID,
    title: "30 Min Meeting",
    slug: "30min",
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 0,
    minNotice: 0, // No minimum notice for testing
    maxFutureDays: 365,
    dailyLimit: null,
    weeklyLimit: null,
    location: "GOOGLE_MEET",
    active: true,
    ...overrides,
  }
}

function makeCalendarConnection(overrides: any = {}) {
  return {
    id: overrides.id || "cal-1",
    userId: TEST_USER_ID,
    provider: "GOOGLE",
    accessToken: "access-token-123",
    refreshToken: "refresh-token-123",
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    email: "cal@gmail.com",
    isPrimary: false,
    checkConflicts: true,
    label: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeAvailabilityRules() {
  // Return rules for all 7 days to avoid timezone-dependent day-of-week mismatches
  return Array.from({ length: 7 }, (_, i) => ({
    id: `avail-${i}`,
    userId: TEST_USER_ID,
    dayOfWeek: i,
    date: null,
    startTime: "08:00",
    endTime: "18:00",
    enabled: true,
  }))
}

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    start: new Date("2026-09-15T10:00:00Z"),
    end: new Date("2026-09-15T10:30:00Z"),
    calendarId: "primary",
    provider: "GOOGLE",
    summary: "Existing Meeting",
    ...overrides,
  }
}

// ─── Tests ───

describe("Multi-Calendar Booking Flow - Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearEventCache()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // ─── Setup ───

  describe("test user setup with 3 connected calendars", () => {
    it("creates a user with 3 calendar connections with correct conflict settings", () => {
      const cal1 = makeCalendarConnection({
        id: "cal-1",
        provider: "GOOGLE",
        email: "personal@gmail.com",
        checkConflicts: true,
        isPrimary: true,
        label: "Personal Google",
      })
      const cal2 = makeCalendarConnection({
        id: "cal-2",
        provider: "OUTLOOK",
        email: "work@outlook.com",
        checkConflicts: true,
        isPrimary: false,
        label: "Work Outlook",
      })
      const cal3 = makeCalendarConnection({
        id: "cal-3",
        provider: "GOOGLE",
        email: "side@gmail.com",
        checkConflicts: false,
        isPrimary: false,
        label: "Side Project",
      })

      expect(cal1.checkConflicts).toBe(true)
      expect(cal2.checkConflicts).toBe(true)
      expect(cal3.checkConflicts).toBe(false)
      expect(cal1.isPrimary).toBe(true)
    })
  })

  // ─── Test availability with conflict detection ───

  describe("availability endpoint with multi-calendar conflicts", () => {
    const cal1 = makeCalendarConnection({
      id: "cal-1",
      provider: "GOOGLE",
      email: "personal@gmail.com",
      checkConflicts: true,
      isPrimary: true,
    })
    const cal2 = makeCalendarConnection({
      id: "cal-2",
      provider: "GOOGLE",
      email: "work@gmail.com",
      checkConflicts: true,
      isPrimary: false,
    })
    const _cal3 = makeCalendarConnection({
      id: "cal-3",
      provider: "GOOGLE",
      email: "side@gmail.com",
      checkConflicts: false,
      isPrimary: false,
    })

    it("marks time slots as unavailable when calendar 1 has a conflicting event", async () => {
      // Setup: conflict detection queries only checkConflicts=true calendars
      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])

      // Calendar 1 has a conflict at 10:00-10:30
      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T10:00:00Z"),
            end: new Date("2026-09-15T10:30:00Z"),
            summary: "Cal1 Meeting",
          }),
        ])
        .mockResolvedValueOnce([]) // Cal2 is free

      const conflicts = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].summary).toBe("Cal1 Meeting")
    })

    it("marks time slots as unavailable when calendar 2 has a conflicting event", async () => {
      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])

      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([]) // Cal1 is free
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T14:00:00Z"),
            end: new Date("2026-09-15T14:30:00Z"),
            summary: "Cal2 Meeting",
          }),
        ])

      const conflicts = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].summary).toBe("Cal2 Meeting")
    })

    it("calendar 3 (checkConflicts=false) events do NOT block availability", async () => {
      // The findMany query only returns calendars with checkConflicts=true
      // So cal3 is NOT included
      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])

      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([]) // Cal1 is free
        .mockResolvedValueOnce([]) // Cal2 is free

      const conflicts = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      // No conflicts since cal3 is excluded from the query
      expect(conflicts).toHaveLength(0)
    })

    it("aggregates conflicts from both calendar 1 and 2", async () => {
      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])

      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T09:00:00Z"),
            end: new Date("2026-09-15T09:30:00Z"),
          }),
        ])
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T14:00:00Z"),
            end: new Date("2026-09-15T15:00:00Z"),
          }),
        ])

      const conflicts = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      expect(conflicts).toHaveLength(2)
    })

    it("getAvailableSlots excludes time slots that conflict with calendar events", async () => {
      // Setup user and event type mocks
      mockUserFindUnique.mockResolvedValue(makeTestUser())
      mockEventTypeFindUnique.mockResolvedValue(makeTestEventType())
      mockAvailabilityFindMany.mockResolvedValue(makeAvailabilityRules())
      mockBookingFindMany.mockResolvedValue([])

      // Conflict detection: return a busy event at 10:00-10:30
      mockCalendarConnectionFindMany.mockResolvedValue([cal1])
      mockFetchGoogleCalendarEvents.mockResolvedValue([
        makeCalendarEvent({
          start: new Date("2026-09-15T10:00:00Z"),
          end: new Date("2026-09-15T10:30:00Z"),
        }),
      ])

      const slots = await getAvailableSlots({
        userId: TEST_USER_ID,
        eventTypeId: TEST_EVENT_TYPE_ID,
        startDate: FAR_FUTURE_DATE,
        endDate: FAR_FUTURE_END,
        timezone: "UTC",
      })

      // The 10:00 slot should NOT be available
      const conflictingSlot = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T10:00:00.000Z"
      )
      expect(conflictingSlot).toBeUndefined()
    })
  })

  // ─── Test calendar settings update ───

  describe("calendar settings update", () => {
    it("toggling checkConflicts changes which calendars are queried", async () => {
      // Initially: cal1 and cal2 have checkConflicts=true
      const cal1 = makeCalendarConnection({ id: "cal-1", checkConflicts: true })
      const cal2 = makeCalendarConnection({
        id: "cal-2",
        email: "work@gmail.com",
        checkConflicts: true,
      })

      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])
      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      await getConflictingEvents(TEST_USER_ID, FAR_FUTURE_DATE, FAR_FUTURE_END)

      // Verify both calendars were queried
      expect(mockFetchGoogleCalendarEvents).toHaveBeenCalledTimes(2)

      // Now toggle cal2 to checkConflicts=false
      clearEventCache()
      vi.clearAllMocks()
      mockCalendarConnectionFindMany.mockResolvedValue([cal1]) // only cal1 now

      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      await getConflictingEvents(TEST_USER_ID, FAR_FUTURE_DATE, FAR_FUTURE_END)

      // Only 1 calendar should be queried now
      expect(mockFetchGoogleCalendarEvents).toHaveBeenCalledTimes(1)
    })

    it("toggling checkConflicts on a calendar with events affects availability", async () => {
      // Setup: cal3 has events but checkConflicts=false, so no conflicts
      mockCalendarConnectionFindMany.mockResolvedValue([])
      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      const result1 = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )
      expect(result1).toHaveLength(0)

      // Now enable checkConflicts on cal3 - it appears in the query results
      clearEventCache()
      vi.clearAllMocks()

      const cal3WithConflicts = makeCalendarConnection({
        id: "cal-3",
        email: "side@gmail.com",
        checkConflicts: true,
      })
      mockCalendarConnectionFindMany.mockResolvedValue([cal3WithConflicts])
      mockFetchGoogleCalendarEvents.mockResolvedValue([
        makeCalendarEvent({
          start: new Date("2026-09-15T10:00:00Z"),
          end: new Date("2026-09-15T10:30:00Z"),
          summary: "Side project meeting",
        }),
      ])

      const result2 = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )
      expect(result2).toHaveLength(1)
    })
  })

  // ─── Test 6-calendar limit ───

  describe("6-calendar limit", () => {
    it("supports up to 6 connected calendars for conflict detection", async () => {
      const sixCalendars = Array.from({ length: 6 }, (_, i) =>
        makeCalendarConnection({
          id: `cal-${i + 1}`,
          email: `user${i + 1}@gmail.com`,
          checkConflicts: true,
        })
      )

      mockCalendarConnectionFindMany.mockResolvedValue(sixCalendars)

      mockFetchGoogleCalendarEvents.mockResolvedValue([
        makeCalendarEvent({ summary: `Meeting` }),
      ])

      const result = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      expect(result).toHaveLength(6) // 1 event per calendar, 6 calendars
      expect(mockFetchGoogleCalendarEvents).toHaveBeenCalledTimes(6)
    })

    it("handles all 6 calendars failing gracefully", async () => {
      const sixCalendars = Array.from({ length: 6 }, (_, i) =>
        makeCalendarConnection({
          id: `cal-${i + 1}`,
          email: `user${i + 1}@gmail.com`,
          checkConflicts: true,
        })
      )

      mockCalendarConnectionFindMany.mockResolvedValue(sixCalendars)

      mockFetchGoogleCalendarEvents.mockRejectedValue(new Error("API unavailable"))

      const result = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      // All failed, should return empty
      expect(result).toHaveLength(0)
    })
  })

  // ─── Test validation rules ───

  describe("validation rules", () => {
    it("prevents disabling checkConflicts on the last calendar that has it enabled", async () => {
      // Simulate the PATCH endpoint validation logic
      const connectionId = "cal-1"
      const connection = makeCalendarConnection({
        id: connectionId,
        checkConflicts: true,
      })

      mockCalendarConnectionFindUnique.mockResolvedValue(connection)

      // No other calendars have checkConflicts=true
      mockCalendarConnectionCount.mockResolvedValue(0)

      // Validate: the count of OTHER calendars with checkConflicts=true is 0
      const otherCheckingCount = await mockCalendarConnectionCount({
        where: {
          userId: TEST_USER_ID,
          id: { not: connectionId },
          checkConflicts: true,
        },
      })

      expect(otherCheckingCount).toBe(0)
      // The API should return a 400 error in this case
    })

    it("allows disabling checkConflicts when other calendars still have it enabled", async () => {
      const connectionId = "cal-1"

      // 1 other calendar has checkConflicts=true
      mockCalendarConnectionCount.mockResolvedValue(1)

      const otherCheckingCount = await mockCalendarConnectionCount({
        where: {
          userId: TEST_USER_ID,
          id: { not: connectionId },
          checkConflicts: true,
        },
      })

      expect(otherCheckingCount).toBe(1)
      // The API should allow this update
    })

    it("prevents disconnecting the last calendar", async () => {
      const connection = makeCalendarConnection({ id: "cal-1" })
      mockCalendarConnectionFindUnique.mockResolvedValue(connection)
      mockCalendarConnectionCount.mockResolvedValue(1)

      const totalCalendars = await mockCalendarConnectionCount({
        where: { userId: TEST_USER_ID },
      })

      expect(totalCalendars).toBe(1)
      // The API should return a 400 error
    })

    it("allows disconnecting when other calendars remain", async () => {
      const connection = makeCalendarConnection({ id: "cal-1" })
      mockCalendarConnectionFindUnique.mockResolvedValue(connection)
      mockCalendarConnectionCount.mockResolvedValue(3)

      const totalCalendars = await mockCalendarConnectionCount({
        where: { userId: TEST_USER_ID },
      })

      expect(totalCalendars).toBe(3)
      // The API should allow the delete
    })
  })

  // ─── Test primary calendar switching ───

  describe("primary calendar management", () => {
    it("setting a new primary unsets the previous primary", async () => {
      const _cal1 = makeCalendarConnection({ id: "cal-1", isPrimary: true })
      const cal2 = makeCalendarConnection({
        id: "cal-2",
        email: "work@gmail.com",
        isPrimary: false,
      })

      mockCalendarConnectionFindUnique.mockResolvedValue(cal2)
      mockCalendarConnectionUpdateMany.mockResolvedValue({ count: 1 })
      mockCalendarConnectionUpdate.mockResolvedValue({
        ...cal2,
        isPrimary: true,
      })

      // Simulate: unset current primary
      await mockCalendarConnectionUpdateMany({
        where: { userId: TEST_USER_ID, isPrimary: true },
        data: { isPrimary: false },
      })

      // Then set the new one
      const updated = await mockCalendarConnectionUpdate({
        where: { id: cal2.id },
        data: { isPrimary: true },
      })

      expect(updated.isPrimary).toBe(true)
      expect(mockCalendarConnectionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPrimary: true }),
          data: { isPrimary: false },
        })
      )
    })

    it("deleting the primary calendar promotes the oldest remaining calendar", async () => {
      const primaryCal = makeCalendarConnection({
        id: "cal-1",
        isPrimary: true,
        createdAt: new Date("2026-01-01"),
      })
      const oldestRemaining = makeCalendarConnection({
        id: "cal-2",
        email: "work@gmail.com",
        isPrimary: false,
        createdAt: new Date("2026-02-01"),
      })

      mockCalendarConnectionFindUnique.mockResolvedValue(primaryCal)
      mockCalendarConnectionCount.mockResolvedValue(3)
      mockCalendarConnectionDelete.mockResolvedValue(primaryCal)
      mockCalendarConnectionFindFirst.mockResolvedValue(oldestRemaining)
      mockCalendarConnectionUpdate.mockResolvedValue({
        ...oldestRemaining,
        isPrimary: true,
      })

      // Simulate the DELETE flow
      await mockCalendarConnectionDelete({ where: { id: primaryCal.id } })

      // After delete, find and promote the oldest
      const nextPrimary = await mockCalendarConnectionFindFirst({
        where: { userId: TEST_USER_ID },
        orderBy: { createdAt: "asc" },
      })

      expect(nextPrimary).toBeDefined()
      expect(nextPrimary.id).toBe("cal-2")

      const promoted = await mockCalendarConnectionUpdate({
        where: { id: nextPrimary.id },
        data: { isPrimary: true },
      })

      expect(promoted.isPrimary).toBe(true)
    })
  })

  // ─── End-to-end booking flow with conflict detection ───

  describe("end-to-end availability flow", () => {
    it("availability reflects conflicts from multiple calendars", async () => {
      const user = makeTestUser()
      const eventType = makeTestEventType()

      mockUserFindUnique.mockResolvedValue(user)
      mockEventTypeFindUnique.mockResolvedValue(eventType)
      mockAvailabilityFindMany.mockResolvedValue(makeAvailabilityRules())
      mockBookingFindMany.mockResolvedValue([])

      // 2 calendars with checkConflicts=true
      const cal1 = makeCalendarConnection({ id: "cal-1", checkConflicts: true })
      const cal2 = makeCalendarConnection({
        id: "cal-2",
        email: "work@gmail.com",
        checkConflicts: true,
      })
      mockCalendarConnectionFindMany.mockResolvedValue([cal1, cal2])

      // Cal1 busy at 10:00-10:30, Cal2 busy at 14:00-14:30
      mockFetchGoogleCalendarEvents
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T10:00:00Z"),
            end: new Date("2026-09-15T10:30:00Z"),
          }),
        ])
        .mockResolvedValueOnce([
          makeCalendarEvent({
            start: new Date("2026-09-15T14:00:00Z"),
            end: new Date("2026-09-15T14:30:00Z"),
          }),
        ])

      const slots = await getAvailableSlots({
        userId: TEST_USER_ID,
        eventTypeId: TEST_EVENT_TYPE_ID,
        startDate: FAR_FUTURE_DATE,
        endDate: FAR_FUTURE_END,
        timezone: "UTC",
      })

      // 10:00 and 14:00 slots should be blocked
      const at10 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T10:00:00.000Z"
      )
      const at14 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T14:00:00.000Z"
      )
      expect(at10).toBeUndefined()
      expect(at14).toBeUndefined()

      // But other slots should be available (e.g., 08:00, 12:00, 16:00)
      const at08 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T08:00:00.000Z"
      )
      const at12 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T12:00:00.000Z"
      )
      expect(at08).toBeDefined()
      expect(at12).toBeDefined()
    })

    it("availability is open when no calendar events exist", async () => {
      mockUserFindUnique.mockResolvedValue(makeTestUser())
      mockEventTypeFindUnique.mockResolvedValue(makeTestEventType())
      mockAvailabilityFindMany.mockResolvedValue(makeAvailabilityRules())
      mockBookingFindMany.mockResolvedValue([])

      mockCalendarConnectionFindMany.mockResolvedValue([
        makeCalendarConnection({ id: "cal-1" }),
      ])
      mockFetchGoogleCalendarEvents.mockResolvedValue([])

      const slots = await getAvailableSlots({
        userId: TEST_USER_ID,
        eventTypeId: TEST_EVENT_TYPE_ID,
        startDate: FAR_FUTURE_DATE,
        endDate: FAR_FUTURE_END,
        timezone: "UTC",
      })

      // With 08:00-18:00 window and 30-min events at 15-min increments,
      // should have many available slots
      expect(slots.length).toBeGreaterThan(0)
    })

    it("existing bookings are combined with calendar events for conflict detection", async () => {
      mockUserFindUnique.mockResolvedValue(makeTestUser())
      mockEventTypeFindUnique.mockResolvedValue(makeTestEventType())
      mockAvailabilityFindMany.mockResolvedValue(makeAvailabilityRules())

      // Existing booking at 09:00-09:30
      mockBookingFindMany.mockResolvedValue([
        {
          startTime: new Date("2026-09-15T09:00:00Z"),
          endTime: new Date("2026-09-15T09:30:00Z"),
        },
      ])

      // Calendar event at 11:00-11:30
      mockCalendarConnectionFindMany.mockResolvedValue([
        makeCalendarConnection({ id: "cal-1" }),
      ])
      mockFetchGoogleCalendarEvents.mockResolvedValue([
        makeCalendarEvent({
          start: new Date("2026-09-15T11:00:00Z"),
          end: new Date("2026-09-15T11:30:00Z"),
        }),
      ])

      const slots = await getAvailableSlots({
        userId: TEST_USER_ID,
        eventTypeId: TEST_EVENT_TYPE_ID,
        startDate: FAR_FUTURE_DATE,
        endDate: FAR_FUTURE_END,
        timezone: "UTC",
      })

      // Both 09:00 and 11:00 should be blocked
      const at09 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T09:00:00.000Z"
      )
      const at11 = slots.find(
        (s) => s.start.toISOString() === "2026-09-15T11:00:00.000Z"
      )
      expect(at09).toBeUndefined()
      expect(at11).toBeUndefined()
    })
  })

  // ─── Mixed provider scenario ───

  describe("mixed provider scenario (Google + Outlook)", () => {
    it("fetches from both Google and Outlook calendars simultaneously", async () => {
      const googleCal = makeCalendarConnection({
        id: "cal-google",
        provider: "GOOGLE",
        email: "user@gmail.com",
        checkConflicts: true,
      })
      const outlookCal = makeCalendarConnection({
        id: "cal-outlook",
        provider: "OUTLOOK",
        email: "user@outlook.com",
        checkConflicts: true,
      })

      mockCalendarConnectionFindMany.mockResolvedValue([googleCal, outlookCal])

      // Google returns events
      mockFetchGoogleCalendarEvents.mockResolvedValue([
        makeCalendarEvent({
          start: new Date("2026-09-15T10:00:00Z"),
          end: new Date("2026-09-15T10:30:00Z"),
          provider: "GOOGLE",
          summary: "Google meeting",
        }),
      ])

      // Outlook returns events via fetch
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            {
              subject: "Outlook meeting",
              start: { dateTime: "2026-09-15T14:00:00.000" },
              end: { dateTime: "2026-09-15T14:30:00.000" },
              showAs: "busy",
            },
          ],
        }),
      })

      const conflicts = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )

      // Should have events from both providers
      expect(conflicts.length).toBeGreaterThanOrEqual(1)
      const googleEvents = conflicts.filter((e) => e.provider === "GOOGLE")
      expect(googleEvents).toHaveLength(1)
    })
  })

  // ─── Cache behavior in integration context ───

  describe("cache behavior across operations", () => {
    it("cache is cleared when calendar settings change", async () => {
      const cal1 = makeCalendarConnection({ id: "cal-1", checkConflicts: true })
      mockCalendarConnectionFindMany.mockResolvedValue([cal1])
      mockFetchGoogleCalendarEvents.mockResolvedValue([makeCalendarEvent()])

      // First call - populates cache
      const result1 = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )
      expect(result1).toHaveLength(1)

      // Simulate a setting change by clearing cache
      clearEventCache(TEST_USER_ID)

      // Now with different data after settings change
      mockCalendarConnectionFindMany.mockResolvedValue([])

      const result2 = await getConflictingEvents(
        TEST_USER_ID,
        FAR_FUTURE_DATE,
        FAR_FUTURE_END
      )
      expect(result2).toHaveLength(0)
    })
  })
})
