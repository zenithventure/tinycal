import { describe, it, expect, vi, beforeEach } from "vitest"

const mockScheduleFindFirst = vi.fn()
const mockUserFindUnique = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    availabilitySchedule: { findFirst: (...a: any[]) => mockScheduleFindFirst(...a) },
  },
}))

import {
  activeScheduleLabel,
  formatRuleDate,
  formatRuleLabel,
  normalizeRule,
  resolveActiveSchedule,
  ruleDateToIso,
  ruleKind,
} from "@/lib/availability-schedule"

describe("date helpers (UTC-safe)", () => {
  const stored = new Date("2026-03-10T00:00:00.000Z")

  it("ruleDateToIso returns the stored calendar day regardless of process timezone", () => {
    expect(ruleDateToIso(stored)).toBe("2026-03-10")
    expect(ruleDateToIso("2026-03-10T00:00:00.000Z")).toBe("2026-03-10")
    expect(ruleDateToIso("2026-03-10")).toBe("2026-03-10")
    expect(ruleDateToIso(null)).toBeNull()
  })

  it("formatRuleDate never shifts to the previous day", () => {
    expect(formatRuleDate(stored)).toBe("Tue, Mar 10, 2026")
    expect(formatRuleDate("2026-03-10T00:00:00.000Z")).toBe("Tue, Mar 10, 2026")
  })

  it("formatRuleLabel handles weekly and date rules", () => {
    expect(formatRuleLabel({ dayOfWeek: 3, date: null })).toBe("Wednesday")
    expect(formatRuleLabel({ dayOfWeek: null, date: stored })).toBe("Tue, Mar 10, 2026")
  })

  it("ruleKind distinguishes weekly from date-specific", () => {
    expect(ruleKind({ date: null })).toBe("weekly")
    expect(ruleKind({ date: stored })).toBe("date-specific")
  })

  it("normalizeRule stores date rules as UTC midnight with no dayOfWeek", () => {
    const n = normalizeRule({ dayOfWeek: 2, date: "2026-03-10T15:30:00.000Z", startTime: "09:00", endTime: "10:00" })
    expect(n.dayOfWeek).toBeNull()
    expect(n.date?.toISOString()).toBe("2026-03-10T00:00:00.000Z")
    expect(n.enabled).toBe(true)
    const w = normalizeRule({ dayOfWeek: 2, startTime: "09:00", endTime: "10:00", enabled: false })
    expect(w).toMatchObject({ dayOfWeek: 2, date: null, enabled: false })
  })
})

describe("resolveActiveSchedule / activeScheduleLabel", () => {
  beforeEach(() => vi.clearAllMocks())

  const linked = { id: "s-event", name: "Evenings", isDefault: false }
  const def = { id: "s-def", name: "Working hours", isDefault: true }

  it("prefers the event type's linked schedule", async () => {
    mockScheduleFindFirst.mockResolvedValueOnce(linked)
    const r = await resolveActiveSchedule("u1", { availabilityScheduleId: "s-event" })
    expect(r).toEqual({ schedule: linked, viaEventType: true })
    expect(activeScheduleLabel(r.schedule, r.viaEventType)).toBe("Evenings")
  })

  it("falls back to the user's default schedule", async () => {
    mockUserFindUnique.mockResolvedValue({ defaultAvailabilityScheduleId: "s-def" })
    mockScheduleFindFirst.mockResolvedValueOnce(def)
    const r = await resolveActiveSchedule("u1", { availabilityScheduleId: null })
    expect(r).toEqual({ schedule: def, viaEventType: false })
    expect(activeScheduleLabel(r.schedule)).toBe("Working hours (default)")
  })

  it("falls back to default when the linked schedule is not found for this user", async () => {
    mockScheduleFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(def)
    mockUserFindUnique.mockResolvedValue({ defaultAvailabilityScheduleId: "s-def" })
    const r = await resolveActiveSchedule("u1", { availabilityScheduleId: "gone" })
    expect(r.schedule).toEqual(def)
  })

  it("returns null when the user has no schedule at all", async () => {
    mockUserFindUnique.mockResolvedValue({ defaultAvailabilityScheduleId: null })
    const r = await resolveActiveSchedule("u1", null)
    expect(r.schedule).toBeNull()
    expect(activeScheduleLabel(r.schedule)).toBe("No schedule configured")
    expect(mockScheduleFindFirst).not.toHaveBeenCalled()
  })
})
