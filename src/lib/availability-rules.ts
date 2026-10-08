// Pure (client-safe) helpers for AvailabilitySchedule rules, #96. No prisma
// import here: dashboard client components use these.
//
// Date-specific rules are stored as UTC-midnight DateTimes. They must be read
// back as *calendar dates*, never converted into a viewer/host timezone — west
// of UTC that shifts the rule onto the previous day (#75/#76).

export type RuleKind = "weekly" | "date-specific"

export interface RuleInput {
  dayOfWeek?: number | null
  date?: string | Date | null
  startTime: string
  endTime: string
  enabled?: boolean
}

export interface NormalizedRule {
  dayOfWeek: number | null
  date: Date | null
  startTime: string
  endTime: string
  enabled: boolean
}

export interface ActiveSchedule {
  id: string
  name: string
  isDefault: boolean
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** "YYYY-MM-DD" for a rule date, using the stored UTC calendar day. */
export function ruleDateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const iso = typeof value === "string" ? value : value.toISOString()
  return iso.slice(0, 10)
}

export function ruleKind(rule: { date?: Date | string | null }): RuleKind {
  return rule.date ? "date-specific" : "weekly"
}

/** Human label for a date rule, e.g. "Mon, Jan 5, 2026" — formatted in UTC so the day never shifts. */
export function formatRuleDate(value: Date | string): string {
  const iso = ruleDateToIso(value)
  if (!iso) return ""
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function formatRuleLabel(rule: { dayOfWeek?: number | null; date?: Date | string | null }): string {
  if (rule.date) return formatRuleDate(rule.date)
  if (typeof rule.dayOfWeek === "number") return DAY_NAMES[rule.dayOfWeek] ?? "Unknown day"
  return "Unknown"
}

/** Label shown on dashboard pages for the schedule currently in effect. */
export function activeScheduleLabel(schedule: ActiveSchedule | null | undefined, viaEventType = false): string {
  if (!schedule) return "No schedule configured"
  if (viaEventType) return schedule.name
  return schedule.isDefault ? `${schedule.name} (default)` : schedule.name
}

/** Turn API input into DB-ready data. A date rule never carries a dayOfWeek. */
export function normalizeRule(r: RuleInput): NormalizedRule {
  const iso = ruleDateToIso(r.date)
  return {
    dayOfWeek: iso ? null : (r.dayOfWeek ?? null),
    date: iso ? new Date(`${iso}T00:00:00.000Z`) : null,
    startTime: r.startTime,
    endTime: r.endTime,
    enabled: r.enabled ?? true,
  }
}

/** Stable identity of a rule, used for backfill dedupe. */
export function ruleKey(r: {
  dayOfWeek: number | null
  date: Date | string | null
  startTime: string
  endTime: string
}): string {
  return [r.dayOfWeek ?? "", ruleDateToIso(r.date) ?? "", r.startTime, r.endTime].join("|")
}
