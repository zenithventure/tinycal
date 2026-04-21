import { describe, it, expect, vi, beforeEach } from "vitest"
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

// Use a future Monday to guarantee dayOfWeek=1
const futureMonday = new Date("2026-05-04T00:00:00Z")
const futureTuesday = new Date("2026-05-05T00:00:00Z")

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

function makeLegacyRule(overrides: Record<string, any> = {}) {
  return {
    id: "legacy-1",
    userId: USER_ID,
    dayOfWeek: 1,
    date: null,
    startTime: "08:00",
    endTime: "09:00",
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
  legacyRules?: any[]
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

  mockAvailabilityFindMany.mockResolvedValue(opts.legacyRules ?? [])
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
      legacyRules: [makeLegacyRule()],
    })

    const slots = await getAvailableSlots(defaultOptions)

    // Should get slots from event schedule (10:00-11:00), not default (14:00-15:00) or legacy (08:00-09:00)
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
      legacyRules: [makeLegacyRule()],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 14)).toBe(true)
    expect(mockAvailabilityFindMany).not.toHaveBeenCalled()
  })

  it("falls back to legacy rules when no schedules exist", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: null },
      user: { ...baseUser, defaultAvailabilityScheduleId: null },
      legacyRules: [makeLegacyRule({ startTime: "08:00", endTime: "09:00" })],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 8)).toBe(true)
    expect(mockAvailabilityFindMany).toHaveBeenCalled()
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

  it("falls back to legacy when both schedules have no rules", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: EVENT_SCHEDULE_ID },
      user: { ...baseUser, defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID },
      eventScheduleRules: [],
      defaultScheduleRules: [],
      legacyRules: [makeLegacyRule({ startTime: "08:00", endTime: "09:00" })],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((s) => s.start.getUTCHours() === 8)).toBe(true)
  })

  it("returns no slots when no availability rules exist anywhere", async () => {
    setupMocks({
      eventType: { ...baseEventType, availabilityScheduleId: null },
      user: { ...baseUser, defaultAvailabilityScheduleId: null },
      legacyRules: [],
    })

    const slots = await getAvailableSlots(defaultOptions)

    expect(slots).toEqual([])
  })
})
