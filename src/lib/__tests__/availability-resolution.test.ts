import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  describeAvailabilitySource,
  getAvailabilityResolutionSummary,
} from "@/lib/availability"

// ─── Mock Prisma ───

const mockUserFindUnique = vi.fn()
const mockAvailabilityScheduleFindUnique = vi.fn()
const mockAvailabilityScheduleFindMany = vi.fn()
const mockAvailabilityRuleCount = vi.fn()
const mockAvailabilityCount = vi.fn()
const mockEventTypeFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    availabilitySchedule: {
      findUnique: (...args: unknown[]) => mockAvailabilityScheduleFindUnique(...args),
      findMany: (...args: unknown[]) => mockAvailabilityScheduleFindMany(...args),
    },
    availabilityRule: {
      count: (...args: unknown[]) => mockAvailabilityRuleCount(...args),
      findMany: vi.fn(),
    },
    availability: {
      count: (...args: unknown[]) => mockAvailabilityCount(...args),
      findMany: vi.fn(),
    },
    eventType: {
      findMany: (...args: unknown[]) => mockEventTypeFindMany(...args),
    },
  },
}))

const USER_ID = "user-1"
const EVENT_SCHEDULE_ID = "sched-event"
const DEFAULT_SCHEDULE_ID = "sched-default"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("describeAvailabilitySource", () => {
  it("reports the event-type schedule when it has enabled rules", async () => {
    mockAvailabilityScheduleFindUnique.mockResolvedValueOnce({
      id: EVENT_SCHEDULE_ID,
      name: "Sales Hours",
    })
    mockAvailabilityRuleCount.mockResolvedValueOnce(3)

    const info = await describeAvailabilitySource(USER_ID, {
      availabilityScheduleId: EVENT_SCHEDULE_ID,
    })

    expect(info).toEqual({
      source: "EVENT_TYPE_SCHEDULE",
      scheduleId: EVENT_SCHEDULE_ID,
      scheduleName: "Sales Hours",
      ruleCount: 3,
    })
    // Should short-circuit before checking user/legacy.
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockAvailabilityCount).not.toHaveBeenCalled()
  })

  it("falls through event-type schedule when no enabled rules exist on it", async () => {
    // Event schedule lookup returns rows but ruleCount is 0
    mockAvailabilityScheduleFindUnique
      .mockResolvedValueOnce({ id: EVENT_SCHEDULE_ID, name: "Empty" }) // event schedule
      .mockResolvedValueOnce({ id: DEFAULT_SCHEDULE_ID, name: "My Default" }) // default
    mockAvailabilityRuleCount
      .mockResolvedValueOnce(0) // event schedule has no enabled rules
      .mockResolvedValueOnce(5) // default schedule does

    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID,
    })

    const info = await describeAvailabilitySource(USER_ID, {
      availabilityScheduleId: EVENT_SCHEDULE_ID,
    })

    expect(info).toEqual({
      source: "USER_DEFAULT_SCHEDULE",
      scheduleId: DEFAULT_SCHEDULE_ID,
      scheduleName: "My Default",
      ruleCount: 5,
    })
  })

  it("reports legacy availability when no schedules win the cascade", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: null,
    })
    mockAvailabilityCount.mockResolvedValueOnce(7)

    const info = await describeAvailabilitySource(USER_ID, {
      availabilityScheduleId: null,
    })

    expect(info).toEqual({
      source: "LEGACY_AVAILABILITY",
      scheduleId: null,
      scheduleName: null,
      ruleCount: 7,
    })
  })

  it("reports NONE when nothing is configured", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: null,
    })
    mockAvailabilityCount.mockResolvedValueOnce(0)

    const info = await describeAvailabilitySource(USER_ID, {
      availabilityScheduleId: null,
    })

    expect(info.source).toBe("NONE")
    expect(info.ruleCount).toBe(0)
  })
})

describe("getAvailabilityResolutionSummary", () => {
  it("classifies each event type by its winning source", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID,
      defaultAvailabilitySchedule: { id: DEFAULT_SCHEDULE_ID, name: "My Default" },
    })
    mockEventTypeFindMany.mockResolvedValueOnce([
      { id: "et-linked", title: "Linked", slug: "linked", availabilityScheduleId: EVENT_SCHEDULE_ID },
      { id: "et-default", title: "Falls to default", slug: "fd", availabilityScheduleId: null },
    ])
    mockAvailabilityCount.mockResolvedValueOnce(2) // legacy rows present but shadowed by default
    mockAvailabilityRuleCount.mockResolvedValueOnce(5) // default schedule rule count
    mockAvailabilityScheduleFindMany.mockResolvedValueOnce([
      { id: EVENT_SCHEDULE_ID, name: "Sales Hours", _count: { rules: 3 } },
    ])

    const summary = await getAvailabilityResolutionSummary(USER_ID)

    expect(summary.defaultSchedule).toEqual({
      id: DEFAULT_SCHEDULE_ID,
      name: "My Default",
      ruleCount: 5,
    })
    expect(summary.legacyRuleCount).toBe(2)
    expect(summary.eventTypes).toEqual([
      {
        id: "et-linked",
        title: "Linked",
        slug: "linked",
        source: "EVENT_TYPE_SCHEDULE",
        scheduleId: EVENT_SCHEDULE_ID,
        scheduleName: "Sales Hours",
      },
      {
        id: "et-default",
        title: "Falls to default",
        slug: "fd",
        source: "USER_DEFAULT_SCHEDULE",
        scheduleId: DEFAULT_SCHEDULE_ID,
        scheduleName: "My Default",
      },
    ])
  })

  it("falls a linked event type through to default when its schedule has no enabled rules", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: DEFAULT_SCHEDULE_ID,
      defaultAvailabilitySchedule: { id: DEFAULT_SCHEDULE_ID, name: "Default" },
    })
    mockEventTypeFindMany.mockResolvedValueOnce([
      { id: "et-linked", title: "Linked", slug: "linked", availabilityScheduleId: EVENT_SCHEDULE_ID },
    ])
    mockAvailabilityCount.mockResolvedValueOnce(0)
    mockAvailabilityRuleCount.mockResolvedValueOnce(4)
    mockAvailabilityScheduleFindMany.mockResolvedValueOnce([
      { id: EVENT_SCHEDULE_ID, name: "Empty", _count: { rules: 0 } },
    ])

    const summary = await getAvailabilityResolutionSummary(USER_ID)

    expect(summary.eventTypes[0].source).toBe("USER_DEFAULT_SCHEDULE")
    expect(summary.eventTypes[0].scheduleName).toBe("Default")
  })

  it("falls through to legacy when neither schedule layer has rules", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: null,
      defaultAvailabilitySchedule: null,
    })
    mockEventTypeFindMany.mockResolvedValueOnce([
      { id: "et-1", title: "Discovery", slug: "discovery", availabilityScheduleId: null },
    ])
    mockAvailabilityCount.mockResolvedValueOnce(3)

    const summary = await getAvailabilityResolutionSummary(USER_ID)

    expect(summary.defaultSchedule).toBeNull()
    expect(summary.legacyRuleCount).toBe(3)
    expect(summary.eventTypes[0].source).toBe("LEGACY_AVAILABILITY")
  })

  it("marks event types as NONE when nothing resolves", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      defaultAvailabilityScheduleId: null,
      defaultAvailabilitySchedule: null,
    })
    mockEventTypeFindMany.mockResolvedValueOnce([
      { id: "et-1", title: "Discovery", slug: "discovery", availabilityScheduleId: null },
    ])
    mockAvailabilityCount.mockResolvedValueOnce(0)

    const summary = await getAvailabilityResolutionSummary(USER_ID)

    expect(summary.eventTypes[0].source).toBe("NONE")
  })
})
