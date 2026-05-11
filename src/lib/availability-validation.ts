// Shared validation for AvailabilityRule shapes posted to the schedules API.
//
// availability.ts builds slot windows by feeding `${date}T${startTime}:00` into
// fromZonedTime — invalid HH:MM strings or inverted ranges silently produce
// `Invalid Date` and no slots, which is hard to diagnose downstream. Catching
// those at the boundary turns silent breakage into a clear 400.

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface RuleInput {
  dayOfWeek?: number | null
  date?: string | Date | null
  startTime?: string
  endTime?: string
  enabled?: boolean
}

export function validateRules(rules: unknown): string | null {
  if (!Array.isArray(rules)) return "rules must be an array"
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as RuleInput
    if (!rule || typeof rule !== "object") return `rules[${i}] must be an object`
    if (!rule.startTime || !rule.endTime) return `rules[${i}] requires startTime and endTime`
    if (!HH_MM.test(rule.startTime)) return `rules[${i}].startTime "${rule.startTime}" must match HH:MM (00:00–23:59)`
    if (!HH_MM.test(rule.endTime)) return `rules[${i}].endTime "${rule.endTime}" must match HH:MM (00:00–23:59)`
    if (rule.startTime >= rule.endTime) return `rules[${i}].startTime (${rule.startTime}) must be before endTime (${rule.endTime})`

    const hasDay = typeof rule.dayOfWeek === "number"
    const hasDate = rule.date != null && rule.date !== ""
    if (!hasDay && !hasDate) return `rules[${i}] needs either dayOfWeek (0–6) or date (YYYY-MM-DD)`
    if (hasDay) {
      const d = rule.dayOfWeek as number
      if (!Number.isInteger(d) || d < 0 || d > 6) return `rules[${i}].dayOfWeek must be an integer 0–6 (got ${d})`
    }
  }
  return null
}
