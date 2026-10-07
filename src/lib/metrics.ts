/**
 * @module metrics
 *
 * Pure math for the four trust metrics (#116) so `scripts/metrics.ts` stays a
 * thin CLI wrapper and the math is unit-testable with mocked rows (no DB).
 *
 * Metric formulas (by day = calendar day of createdAt, window = last N days):
 * 1. booking conversion   = booking_completed / session_started
 * 2. time-to-book p50/p90 = percentile of (booking_completed.createdAt -
 *                           booking_started.createdAt) for pairs joined by
 *                           meta.visitId (start precedes completion)
 * 3. conflict proxy       = conflict_found / slot_checked
 * 4. setup completion     = event_type_created / user_signed_up, per user
 *
 * Ratios where the denominator is 0 are reported as 0 (not NaN) so the
 * METRICS_JSON tail line is always machine-parsable.
 */

export interface MetricEventRow {
  type: string
  userId?: string | null
  meta: unknown
  createdAt: Date
}

export interface DayRatio {
  day: string // YYYY-MM-DD (UTC)
  numerator: number
  denominator: number
  value: number
}

export interface MetricsResult {
  windowDays: number
  conversion: {
    daily: DayRatio[]
    overall: number | null
  }
  timeToBook: {
    p50Ms: number | null
    p90Ms: number | null
    pairedBookings: number
  }
  conflictProxy: number | null
  setupCompletion: {
    daily: DayRatio[]
    byUser: { userId: string; value: number; eventTypes: number; signups: number }[]
    overallUsersComplete: number
    overallUsers: number
  }
}

/** Read meta as a plain object (rows may arrive as JSON strings or objects). */
export function rowMeta(row: MetricEventRow): Record<string, unknown> {
  let meta = row.meta
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta as string)
    } catch {
      meta = {}
    }
  }
  return (meta ?? {}) as Record<string, unknown>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Nearest-rank percentile: ceil(p/100 * n)-th smallest element of sorted. */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const rank = Math.ceil((p / 100) * sortedAsc.length)
  const idx = Math.min(sortedAsc.length, Math.max(1, rank)) - 1
  return sortedAsc[idx]
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dailyRatio(
  numerator: MetricEventRow[],
  denominator: MetricEventRow[],
  allDays: string[]
): DayRatio[] {
  const map = new Map<string, { n: number; d: number }>()
  const add = (rows: MetricEventRow[], field: "n" | "d") => {
    for (const r of rows) {
      const key = dayKey(r.createdAt)
      const cell = map.get(key) ?? { n: 0, d: 0 }
      cell[field] += 1
      map.set(key, cell)
    }
  }
  add(numerator, "n")
  add(denominator, "d")
  return allDays
    .map((day) => {
      const cell = map.get(day) ?? { n: 0, d: 0 }
      return {
        day,
        numerator: cell.n,
        denominator: cell.d,
        value: cell.d === 0 ? 0 : round2(cell.n / cell.d),
      }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** All UTC day keys in the window, oldest first (includes today). */
export function daysInWindow(daysCount: number, now = new Date()): string[] {
  const days: string[] = []
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export function computeMetrics(rows: MetricEventRow[], daysCount = 14): MetricsResult {
  const days = daysInWindow(daysCount)
  const byType = (t: string) => rows.filter((r) => r.type === t)

  // 1. booking conversion
  const sessions = byType("session_started")
  const completed = byType("booking_completed")
  const conversionDaily = dailyRatio(completed, sessions, days)
  const convOverall =
    sessions.length === 0
      ? null
      : round2(completed.length / sessions.length)

  // 2. time-to-book from visitId pairs
  const pairMap = new Map<string, { start?: Date; complete?: Date }>()
  for (const r of [...byType("booking_started"), ...byType("booking_completed")]) {
    const visitId = rowMeta(r).visitId
    if (typeof visitId !== "string" || visitId === "") continue
    const slot = pairMap.get(visitId) ?? { start: undefined, complete: undefined }
    if (r.type === "booking_started") slot.start = r.createdAt
    else slot.complete = r.createdAt
    pairMap.set(visitId, slot)
  }
  const durs: number[] = []
  for (const slot of Array.from(pairMap.values())) {
    if (slot.start && slot.complete && slot.complete >= slot.start) {
      durs.push(slot.complete.getTime() - slot.start.getTime())
    }
  }
  durs.sort((a, b) => a - b)

  // 3. conflict / double-book proxy
  const slotChecked = byType("slot_checked")
  const conflictFound = byType("conflict_found")
  const conflictProxy =
    slotChecked.length === 0 ? null : round2(conflictFound.length / slotChecked.length)

  // 4. setup completion (by user). userId comes from the userId column on
  //  user_signed_up / event_type_created (falls back to meta for flexibility).
  const userMap = new Map<string, { created: number; signedUp: number }>()
  const bump = (rows: MetricEventRow[], field: "created" | "signedUp") => {
    for (const r of rows) {
      const meta = rowMeta(r)
      const userId = r.userId ?? (typeof meta.userId === "string" ? (meta.userId as string) : undefined)
      if (!userId) continue
      const cell = userMap.get(userId) ?? { created: 0, signedUp: 0 }
      cell[field] += 1
      userMap.set(userId, cell)
    }
  }
  bump(byType("event_type_created"), "created")
  bump(byType("user_signed_up"), "signedUp")

  const byUser = Array.from(userMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([userId, cell]) => ({
      userId,
      eventTypes: cell.created,
      signups: cell.signedUp,
      value: cell.signedUp === 0 ? 0 : round2(Math.min(1, cell.created / cell.signedUp)),
    }))
  // Daily setup completion across users (sum of numerators / sum of signups)
  const setupDaily = dailyRatio(
    // numerator rows: event_type_created (any user); denominator: user_signed_up
    byType("event_type_created"),
    byType("user_signed_up"),
    days
  )

  const completeUsers = byUser.filter((u) => u.signups > 0 && u.eventTypes >= 1).length

  return {
    windowDays: daysCount,
    conversion: { daily: conversionDaily, overall: convOverall },
    timeToBook: {
      p50Ms: percentile(durs, 50),
      p90Ms: percentile(durs, 90),
      pairedBookings: durs.length,
    },
    conflictProxy,
    setupCompletion: {
      daily: setupDaily,
      byUser,
      overallUsers: byUser.filter((u) => u.signups > 0).length,
      overallUsersComplete: completeUsers,
    },
  }
}

/** Stable key order for the machine-readable tail line. */
export function metricsToStableJson(m: MetricsResult): string {
  const out = {
    windowDays: m.windowDays,
    bookingConversion: {
      overall: m.conversion.overall,
      daily: m.conversion.daily,
    },
    timeToBook: m.timeToBook,
    conflictProxy: m.conflictProxy,
    setupCompletion: m.setupCompletion,
  }
  return JSON.stringify(out)
}
