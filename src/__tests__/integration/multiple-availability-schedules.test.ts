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

vi.mock("@/lib/calendar/conflict-detection", () => ({
  getConflictingEvents: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }))

// ─── Test Data ───

const USER_ID = "user-avail-test"
const EVENT_TYPE_ID = "et-avail-test"
const SCHEDULE_A_ID = "schedule-a"
const SCHEDULE_B_ID = "schedule-b"

// Far future dates to bypass minNotice
const START = new Date("2027-03-01T00:00:00Z")
const END = new Date("2027-03-02T00:00:00Z")

function makeUser() {
  return { id: USER_ID, timezone: "UTC", plan: "PRO" }
}

function makeEventType(overrides: any = {}) {
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
    isCollective: false,
    ...overrides,
  }
}

function makeRules(scheduleId: string | null, startTime = "09:00", endTime = "17:00") {
  // All days to avoid timezone day-of-week mismatches
  return Array.from({ length: 7 }, (_, i) => ({
    id: `rule-${scheduleId}-${i}`,
    userId: USER_ID,
    scheduleId,
    dayOfWeek: i,
    date: null,
    startTime,
    endTime,
    enabled: true,
  }))
}

// ─── Tests ───

describe("Multiple Availability Schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBookingFindMany.mockResolvedValue([])
    mockCalendarConnectionFindMany.mockResolvedValue([])
  })

  describe("getAvailableSlots — schedule resolution", () => {
    it("uses the event type's linked schedule when availabilityScheduleId is set", async () => {
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(
        makeEventType({ availabilityScheduleId: SCHEDULE_A_ID })
      )

      // Schedule A: 10:00–12:00 only (narrow window)
      mockAvailabilityFindMany.mockResolvedValue(makeRules(SCHEDULE_A_ID, "10:00", "12:00"))

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      // Should only have slots within 10:00–12:00 (30-min events at 15-min increments)
      expect(slots.length).toBeGreaterThan(0)
      for (const slot of slots) {
        const hour = slot.start.getUTCHours()
        expect(hour).toBeGreaterThanOrEqual(10)
        expect(hour).toBeLessThan(12)
      }

      // Prisma was queried with scheduleId = SCHEDULE_A_ID
      expect(mockAvailabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduleId: SCHEDULE_A_ID }),
        })
      )
      // Default schedule lookup should NOT have been called
      expect(mockAvailabilityScheduleFindFirst).not.toHaveBeenCalled()
    })

    it("falls back to the default schedule when event type has no linked schedule", async () => {
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(makeEventType()) // no availabilityScheduleId

      // Default schedule exists
      mockAvailabilityScheduleFindFirst.mockResolvedValue({
        id: SCHEDULE_B_ID,
        userId: USER_ID,
        name: "Default",
        isDefault: true,
      })

      // Default schedule rules: 14:00–16:00
      mockAvailabilityFindMany.mockResolvedValue(makeRules(SCHEDULE_B_ID, "14:00", "16:00"))

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      expect(slots.length).toBeGreaterThan(0)
      for (const slot of slots) {
        const hour = slot.start.getUTCHours()
        expect(hour).toBeGreaterThanOrEqual(14)
        expect(hour).toBeLessThan(16)
      }

      expect(mockAvailabilityScheduleFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isDefault: true }) })
      )
    })

    it("falls back to legacy unscoped rules when no schedule exists at all", async () => {
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(makeEventType()) // no availabilityScheduleId

      // No default schedule
      mockAvailabilityScheduleFindFirst.mockResolvedValue(null)

      // Legacy rules (scheduleId = null): 08:00–10:00
      mockAvailabilityFindMany.mockResolvedValue(makeRules(null, "08:00", "10:00"))

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      expect(slots.length).toBeGreaterThan(0)
      for (const slot of slots) {
        const hour = slot.start.getUTCHours()
        expect(hour).toBeGreaterThanOrEqual(8)
        expect(hour).toBeLessThan(10)
      }

      // Should query with scheduleId: null (legacy)
      expect(mockAvailabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduleId: null }),
        })
      )
    })

    it("returns empty slots when no availability rules exist", async () => {
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(makeEventType())
      mockAvailabilityScheduleFindFirst.mockResolvedValue(null)
      mockAvailabilityFindMany.mockResolvedValue([]) // no rules

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      expect(slots).toHaveLength(0)
    })

    it("returns empty when user not found", async () => {
      mockUserFindUnique.mockResolvedValue(null)
      mockEventTypeFindUnique.mockResolvedValue(makeEventType())

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      expect(slots).toHaveLength(0)
    })

    it("returns empty when event type not found", async () => {
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(null)

      const slots = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: EVENT_TYPE_ID,
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      expect(slots).toHaveLength(0)
    })
  })

  describe("schedule isolation", () => {
    it("two event types linked to different schedules produce different slots", async () => {
      const eventTypeA = makeEventType({ id: "et-a", availabilityScheduleId: SCHEDULE_A_ID })
      const eventTypeB = makeEventType({ id: "et-b", availabilityScheduleId: SCHEDULE_B_ID })

      // Event type A → Schedule A (morning: 08:00–10:00)
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(eventTypeA)
      mockAvailabilityFindMany.mockResolvedValue(makeRules(SCHEDULE_A_ID, "08:00", "10:00"))

      const slotsA = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: "et-a",
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      // Event type B → Schedule B (afternoon: 14:00–16:00)
      vi.clearAllMocks()
      mockBookingFindMany.mockResolvedValue([])
      mockCalendarConnectionFindMany.mockResolvedValue([])
      mockUserFindUnique.mockResolvedValue(makeUser())
      mockEventTypeFindUnique.mockResolvedValue(eventTypeB)
      mockAvailabilityFindMany.mockResolvedValue(makeRules(SCHEDULE_B_ID, "14:00", "16:00"))

      const slotsB = await getAvailableSlots({
        userId: USER_ID,
        eventTypeId: "et-b",
        startDate: START,
        endDate: END,
        timezone: "UTC",
      })

      // Slots A should all be morning
      for (const s of slotsA) {
        expect(s.start.getUTCHours()).toBeLessThan(12)
      }

      // Slots B should all be afternoon
      for (const s of slotsB) {
        expect(s.start.getUTCHours()).toBeGreaterThanOrEqual(14)
      }

      // No overlap
      const aSet = new Set(slotsA.map((s) => s.start.toISOString()))
      for (const s of slotsB) {
        expect(aSet.has(s.start.toISOString())).toBe(false)
      }
    })
  })
})
