import { describe, it, expect, vi, beforeEach } from "vitest"
import { getAvailableSlots } from "@/lib/availability"

// ─── Mock Prisma ───

const mockUserFindUnique = vi.fn()
const mockEventTypeFindUnique = vi.fn()
const mockAvailabilityFindMany = vi.fn()
const mockAvailabilityScheduleFindFirst = vi.fn()
const mockBookingFindMany = vi.fn()
const mockCalendarConnectionFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
    eventType: { findUnique: (...args: any[]) => mockEventTypeFindUnique(...args) },
    availability: { findMany: (...args: any[]) => mockAvailabilityFindMany(...args) },
    availabilitySchedule: { findFirst: (...args: any[]) => mockAvailabilityScheduleFindFirst(...args) },
    booking: { findMany: (...args: any[]) => mockBookingFindMany(...args) },
    calendarConnection: { findMany: (...args: any[]) => mockCalendarConnectionFindMany(...args) },
  },
}))

vi.mock("@/lib/calendar/google-calendar", () => ({
  fetchGoogleCalendarEvents: vi.fn().mockResolvedValue([]),
  refreshGoogleToken: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }))

// ─── Test Data ───

const USER_ID = "user-1"
const EVENT_TYPE_ID = "et-1"
const SCHEDULE_A_ID = "sched-a"
const SCHEDULE_B_ID = "sched-b"

const FAR_FUTURE = new Date("2026-09-15T00:00:00Z")
const FAR_FUTURE_END = new Date("2026-09-16T00:00:00Z")

function makeUser(overrides = {}) {
  return { id: USER_ID, timezone: "UTC", plan: "PRO", ...overrides }
}

function makeEventType(overrides = {}) {
  return {
    id: EVENT_TYPE_ID,
    userId: USER_ID,
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 0,
    minNotice: 0,
    maxFutureDays: 365,
    dailyLimit: null,
    weeklyLimit: null,
    availabilityScheduleId: null,
    ...overrides,
  }
}

function makeRules(startTime: string, endTime: string) {
  return Array.from({ length: 7 }, (_, i) => ({
    id: `rule-${i}`,
    userId: USER_ID,
    scheduleId: null,
    dayOfWeek: i,
    date: null,
    startTime,
    endTime,
    enabled: true,
  }))
}

// ─── Tests ───

describe("Availability Schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCalendarConnectionFindMany.mockResolvedValue([])
    mockBookingFindMany.mockResolvedValue([])
  })

  it("uses legacy rules when event type has no schedule and no default schedule exists", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockEventTypeFindUnique.mockResolvedValue(makeEventType({ availabilityScheduleId: null }))
    mockAvailabilityScheduleFindFirst.mockResolvedValue(null) // no default schedule

    // Legacy rules: 08:00-18:00
    mockAvailabilityFindMany.mockResolvedValue(makeRules("08:00", "18:00"))

    const slots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: EVENT_TYPE_ID,
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    expect(slots.length).toBeGreaterThan(0)
    // Should query availability with scheduleId: null
    expect(mockAvailabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, scheduleId: null, enabled: true }),
      })
    )
  })

  it("uses the event type's linked schedule when set", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockEventTypeFindUnique.mockResolvedValue(
      makeEventType({ availabilityScheduleId: SCHEDULE_A_ID })
    )

    // Schedule A rules: 10:00-12:00 (narrow window)
    const narrowRules = makeRules("10:00", "12:00").map((r) => ({
      ...r,
      scheduleId: SCHEDULE_A_ID,
    }))
    mockAvailabilityFindMany.mockResolvedValue(narrowRules)

    const slots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: EVENT_TYPE_ID,
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    // Should query by scheduleId
    expect(mockAvailabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scheduleId: SCHEDULE_A_ID, enabled: true }),
      })
    )

    // All slots should be within 10:00-12:00
    for (const slot of slots) {
      expect(slot.start.getUTCHours()).toBeGreaterThanOrEqual(10)
      expect(slot.end.getUTCHours()).toBeLessThanOrEqual(12)
    }
  })

  it("falls back to default schedule when event type has no linked schedule", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockEventTypeFindUnique.mockResolvedValue(makeEventType({ availabilityScheduleId: null }))

    // Default schedule exists
    mockAvailabilityScheduleFindFirst.mockResolvedValue({
      id: SCHEDULE_B_ID,
      userId: USER_ID,
      name: "Default",
      isDefault: true,
    })

    mockAvailabilityFindMany.mockResolvedValue(
      makeRules("09:00", "17:00").map((r) => ({ ...r, scheduleId: SCHEDULE_B_ID }))
    )

    const slots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: EVENT_TYPE_ID,
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    expect(slots.length).toBeGreaterThan(0)
    expect(mockAvailabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scheduleId: SCHEDULE_B_ID, enabled: true }),
      })
    )
  })

  it("different event types use different schedules producing different slots", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockBookingFindMany.mockResolvedValue([])

    // Event type A -> Schedule A (mornings only: 08:00-12:00)
    mockEventTypeFindUnique.mockResolvedValue(
      makeEventType({ id: "et-a", availabilityScheduleId: SCHEDULE_A_ID })
    )
    mockAvailabilityFindMany.mockResolvedValue(
      makeRules("08:00", "12:00").map((r) => ({ ...r, scheduleId: SCHEDULE_A_ID }))
    )

    const morningSlots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: "et-a",
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    vi.clearAllMocks()
    mockCalendarConnectionFindMany.mockResolvedValue([])
    mockBookingFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue(makeUser())

    // Event type B -> Schedule B (afternoons only: 14:00-18:00)
    mockEventTypeFindUnique.mockResolvedValue(
      makeEventType({ id: "et-b", availabilityScheduleId: SCHEDULE_B_ID })
    )
    mockAvailabilityFindMany.mockResolvedValue(
      makeRules("14:00", "18:00").map((r) => ({ ...r, scheduleId: SCHEDULE_B_ID }))
    )

    const afternoonSlots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: "et-b",
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    // Morning slots should be before noon
    for (const slot of morningSlots) {
      expect(slot.start.getUTCHours()).toBeLessThan(12)
    }

    // Afternoon slots should be at or after 14:00
    for (const slot of afternoonSlots) {
      expect(slot.start.getUTCHours()).toBeGreaterThanOrEqual(14)
    }

    // The two sets should not overlap
    const morningTimes = new Set(morningSlots.map((s) => s.start.getTime()))
    const hasOverlap = afternoonSlots.some((s) => morningTimes.has(s.start.getTime()))
    expect(hasOverlap).toBe(false)
  })

  it("returns empty slots when event type links to a schedule with no enabled rules", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockEventTypeFindUnique.mockResolvedValue(
      makeEventType({ availabilityScheduleId: SCHEDULE_A_ID })
    )
    mockAvailabilityFindMany.mockResolvedValue([]) // no rules

    const slots = await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: EVENT_TYPE_ID,
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    expect(slots).toHaveLength(0)
  })

  it("linked schedule takes priority over default schedule", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser())
    mockEventTypeFindUnique.mockResolvedValue(
      makeEventType({ availabilityScheduleId: SCHEDULE_A_ID })
    )

    // Should NOT look up default schedule when event type has explicit link
    mockAvailabilityFindMany.mockResolvedValue(makeRules("06:00", "08:00"))

    await getAvailableSlots({
      userId: USER_ID,
      eventTypeId: EVENT_TYPE_ID,
      startDate: FAR_FUTURE,
      endDate: FAR_FUTURE_END,
      timezone: "UTC",
    })

    // Should not have queried for default schedule
    expect(mockAvailabilityScheduleFindFirst).not.toHaveBeenCalled()
  })
})
