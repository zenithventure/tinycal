import { describe, it, expect, vi, beforeEach } from "vitest"
import { formatInTimeZone } from "date-fns-tz"
import { getAvailableSlots } from "@/lib/availability"

// ─── Mock Prisma ───

const mockUserFindUnique = vi.fn()
const mockEventTypeFindUnique = vi.fn()
const mockAvailabilityFindMany = vi.fn()
const mockAvailabilityRuleFindMany = vi.fn()
const mockBookingFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
    eventType: {
      findUnique: (...args: any[]) => mockEventTypeFindUnique(...args),
    },
    availability: {
      findMany: (...args: any[]) => mockAvailabilityFindMany(...args),
    },
    availabilityRule: {
      findMany: (...args: any[]) => mockAvailabilityRuleFindMany(...args),
    },
    booking: {
      findMany: (...args: any[]) => mockBookingFindMany(...args),
    },
  },
}))

vi.mock("@/lib/calendar/conflict-detection", () => ({
  getConflictingEvents: vi.fn().mockResolvedValue([]),
  clearEventCache: vi.fn(),
}))

// ─── Test Data ───

const USER_ID = "user-1"
const EVENT_TYPE_ID = "et-1"
const EVENT_SCHEDULE_ID = "sched-event"
const DEFAULT_SCHEDULE_ID = "sched-default"

const baseUser = {
  id: USER_ID,
  timezone: "UTC",
  defaultAvailabilityScheduleId: null as string | null,
}

const baseEventType = {
  id: EVENT_TYPE_ID,
  duration: 30,
  bufferBefore: 0,
  bufferAfter: 0,
  minNotice: 0,
  dailyLimit: null,
  weeklyLimit: null,
  availabilityScheduleId: null as string | null,
}

// Use the next future Monday to guarantee dayOfWeek=1 without going stale.
function nextFutureMonday() {
  const today = new Date()
  const daysUntilMonday = (8 - today.getUTCDay()) % 7 || 7
  const monday = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + daysUntilMonday,
    0,
    0,
    0,
    0
  ))
  return monday
}

const futureMonday = nextFutureMonday()
const futureTuesday = new Date(futureMonday.getTime() + 24 * 60 * 60 * 1000)

const defaultOptions = {
  userId: USER_ID,
  eventTypeId: EVENT_TYPE_ID,
  startDate: futureMonday,
  endDate: futureTuesday,
  timezone: "UTC",
}

function makeRule(scheduleId: string, overrides: Record<string, any> = {}) {
  return {
    id: `rule-${scheduleId}`,
    availabilityScheduleId: scheduleId,
    dayOfWeek: 1, // Monday
    date: null,
    startTime: "10:00",
    endTime: "11:00",
    enabled: true,
    ...overrides,
  }
}

// ─── Helpers ───

function setupMocks(opts: {
  user?: typeof baseUser
  eventType?: typeof baseEventType
  eventScheduleRules?: any[]
  defaultScheduleRules?: any[]
}) {
  const user = opts.user ?? baseUser
  const eventType = opts.eventType ?? baseEventType

  // First call: from getAvailableSlots (full user)
  // Second call: from resolveAvailabilityRules (select defaultAvailabilityScheduleId)
  mockUserFindUnique.mockImplementation(({ select }: any) => {
    if (select) return Promise.resolve({ defaultAvailabilityScheduleId: user.defaultAvailabilityScheduleId })
    return Promise.resolve(user)
  })

  mockEventTypeFindUnique.mockResolvedValue(eventType)
  mockBookingFindMany.mockResolvedValue([])

  // AvailabilityRule mock - route by scheduleId
  mockAvailabilityRuleFindMany.mockImplementation(({ where }: any) => {
    if (where.availabilityScheduleId === EVENT_SCHEDULE_ID) {
      return Promise.resolve(opts.eventScheduleRules ?? [])
    }
    if (where.availabilityScheduleId === DEFAULT_SCHEDULE_ID) {
      return Promise.resolve(opts.defaultScheduleRules ?? [])
    }
    return Promise.resolve([])
  })

  // The legacy `Availability` table must never be read (#96). Rows here would
  // change the expected slots if any code path still consulted it.
  mockAvailabilityFindMany.mockResolvedValue([
    { id: "legacy-1", userId: USER_ID, dayOfWeek: 1, date: null, startTime: "08:00", endTime: "09:00", enabled: true },
  ])
}

// ─── Tests ───

describe("Availability schedule resolution (fallback chain)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses event type's linked schedule when present", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: EVENT_SCHEDULE_ID },
      user: { ...baseUser, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
      eventScheduleRules: [makeRule(EVENT_SCHEDULE_ID, { startTime: "10:00", endTime: "11:00" })],
      defaultScheduleRules: [makeRule(DEFAULT_SCHEDULE_ID, { startTime: "14:00", endTime: "15:00" })],
    })

    const slots = await getAvailableSlots(defaultOptions)

    // Should get slots from event schedule (10:00-11:00), not default (14:00-15:00)
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 10)).toBe(true)
    // Should NOT have queried legacy availability
    expect(mockAvailabilityFindMany).not.toHaveBeenCalled()
  })

  it("falls back to user default schedule when event type has no schedule", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: null },
      user: { ...baseUser, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
      defaultScheduleRules: [makeRule(DEFAULT_SCHEDULE_ID, { startTime: "14:00", endTime: "15:00" })],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 14)).toBe(true)
    expect(mockAvailabilityFindMany).not.toHaveBeenCalled()
  })

  it("does not fall back to legacy Availability rows when no schedules exist", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: null },
      user: { ...baseUser, defaultAvailabilityScheduleId: null },
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots).toEqual([])
    expect(mockAvailabilityFindMany).not.toHaveBeenCalled()
  })

  it("falls back to user default when event schedule has no enabled rules", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: EVENT_SCHEDULE_ID },
      user: { ...baseUser, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
      eventScheduleRules: [], // no enabled rules
      defaultScheduleRules: [makeRule(DEFAULT_SCHEDULE_ID, { startTime: "14:00", endTime: "15:00" })],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 14)).toBe(true)
  })

  it("returns no slots (and ignores legacy rows) when both schedules have no rules", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: EVENT_SCHEDULE_ID },
      user: { ...baseUser, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
      eventScheduleRules: [],
      defaultScheduleRules: [],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots).toEqual([])
    expect(mockAvailabilityFindMany).not.toHaveBeenCalled()
  })
})

describe("Date-specific rules are matched by stored calendar date (#75/#76)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Rule stored as UTC midnight of futureTuesday's calendar date.
  const dateRule = () =>
    makeRule(DEFAULT_SCHEDULE_ID, {
      dayOfWeek: null,
      date: new Date(futureTuesday),
      startTime: "13:00",
      endTime: "14:00",
    })

  it.each(["America/Los_Angeles", "America/New_York", "UTC", "Asia/Tokyo"])(
    "applies a date rule on its own day for a host in %s",
    async (tz) => {
      setupMocks({
        user: { ...baseUser, timezone: tz, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
        defaultScheduleRules: [
          // A weekly Tuesday rule that the date rule must override on that exact day.
          makeRule(DEFAULT_SCHEDULE_ID, { dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }),
          dateRule(),
        ],
      })

      const dayStr = futureTuesday.toISOString().slice(0, 10)
      const slots = await getAvailableSlots({
        ...defaultOptions,
        timezone: tz,
        // Wide window so the host-timezone day is fully covered.
        startDate: new Date(futureTuesday.getTime() - 24 * 60 * 60 * 1000),
        endDate: new Date(futureTuesday.getTime() + 48 * 60 * 60 * 1000),
      })

      const onTargetDay = slots.filter((s) => formatInTimeZone(s.start, tz, "yyyy-MM-dd") === dayStr)
      // Date rule wins: 13:00 and 13:30 host-local, and no 09:00 weekly slots.
      expect(onTargetDay.map((s) => formatInTimeZone(s.start, tz, "HH:mm"))).toEqual(["13:00", "13:30"])
    }
  )
})
