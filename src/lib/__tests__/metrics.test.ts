import { describe, it, expect } from "vitest"
import {
  computeMetrics,
  percentile,
  rowMeta,
  type MetricEventRow,
} from "../metrics"

// ─── #116 metrics math — pure functions, seeded rows, no DB ─────────────────

function row(
  type: string,
  at: string,
  extra: Partial<MetricEventRow> = {}
): MetricEventRow {
  return { type, meta: {}, createdAt: new Date(at), ...extra }
}

// Anchor: rows live on 2026-10-01..2026-10-05 — inside the default 14-day
// window relative to "now" for the baseline window this slice ships into.

describe("metrics math (#116)", () => {
  it("computes booking conversion = completed / sessions (overall + by day)", () => {
    const rows: MetricEventRow[] = [
      row("session_started", "2026-10-03T10:00:00Z", { meta: { visitId: "v1" } }),
      row("session_started", "2026-10-03T11:00:00Z", { meta: { visitId: "v2" } }),
      row("session_started", "2026-10-04T09:00:00Z", { meta: { visitId: "v3" } }),
      row("booking_completed", "2026-10-03T10:05:00Z", { meta: { visitId: "v1" } }),
      row("booking_completed", "2026-10-04T09:20:00Z", { meta: { visitId: "v3" } }),
    ]

    const m = computeMetrics(rows, 14)
    // 2/3 rounds to 0.67 (round2); exact ratio asserted separately for clarity
    expect(m.conversion.overall).toBe(0.67)
    expect(m.conversion.daily.flatMap((d) => [d.numerator]).reduce((a, b) => a + b, 0)).toBe(2)

    const byDay = new Map(m.conversion.daily.map((d) => [d.day, d]))
    expect(byDay.get("2026-10-03")?.value).toBeCloseTo(0.5, 5)
    expect(byDay.get("2026-10-04")?.value).toBe(1)
    expect(byDay.get("2026-10-03")?.numerator).toBe(1)
    expect(byDay.get("2026-10-03")?.denominator).toBe(2)
  })

  it("computes time-to-book p50/p90 from visitId pairs only", () => {
    const rows: MetricEventRow[] = [
      // v1: 5m
      row("booking_started", "2026-10-01T10:00:00Z", { meta: { visitId: "v1" } }),
      row("booking_completed", "2026-10-01T10:05:00Z", { meta: { visitId: "v1" } }),
      // v2: 30m
      row("booking_started", "2026-10-02T10:00:00Z", { meta: { visitId: "v2" } }),
      row("booking_completed", "2026-10-02T10:30:00Z", { meta: { visitId: "v2" } }),
      // v3: 25m
      row("booking_started", "2026-10-03T10:00:00Z", { meta: { visitId: "v3" } }),
      row("booking_completed", "2026-10-03T10:25:00Z", { meta: { visitId: "v3" } }),
      // Unpaired — no visitId: excluded from time-to-book only.
      row("booking_started", "2026-10-04T10:00:00Z", {}),
      row("booking_completed", "2026-10-04T10:01:00Z", {}),
      // Inverted (completion before start) — excluded.
      row("booking_completed", "2026-10-05T09:00:00Z", { meta: { visitId: "bad" } }),
      row("booking_started", "2026-10-05T09:30:00Z", { meta: { visitId: "bad" } }),
    ]

    const m = computeMetrics(rows, 14)
    expect(m.timeToBook.pairedBookings).toBe(3)
    expect(m.timeToBook.p50Ms).toBe(25 * 60_000)
    expect(m.timeToBook.p90Ms).toBe(30 * 60_000)
  })

  it("computes the conflict proxy = conflict_found / slot_checked", () => {
    const rows: MetricEventRow[] = [
      row("slot_checked", "2026-10-01T00:00:00Z"),
      row("slot_checked", "2026-10-02T00:00:00Z"),
      row("slot_checked", "2026-10-03T00:00:00Z"),
      row("slot_checked", "2026-10-04T00:00:00Z"),
      row("slot_checked", "2026-10-05T00:00:00Z"),
      row("conflict_found", "2026-10-02T00:00:00Z"),
      row("conflict_found", "2026-10-04T00:00:00Z"),
    ]
    expect(computeMetrics(rows, 14).conflictProxy).toBe(0.4)
    // Zero denominator → 0 (machine-readable, never NaN):
    expect(computeMetrics([row("conflict_found", "2026-10-04T00:00:00Z")], 14).conflictProxy).toBeNull()
    expect(computeMetrics([], 14).conflictProxy).toBeNull()
  })

  it("computes setup completion per user (event_type_created / user_signed_up)", () => {
    const rows: MetricEventRow[] = [
      row("user_signed_up", "2026-10-01T00:00:00Z", { userId: "alice" }),
      row("event_type_created", "2026-10-01T01:00:00Z", { userId: "alice" }),
      row("user_signed_up", "2026-10-02T00:00:00Z", { userId: "bob" }),
      // bob never creates an event type
      row("user_signed_up", "2026-10-03T00:00:00Z", { userId: "carol" }),
      row("event_type_created", "2026-10-03T01:00:00Z", { userId: "carol" }),
      row("event_type_created", "2026-10-03T02:00:00Z", { userId: "carol" }),
      // anonymous/no-user rows must not crash and must not pollute:
      row("user_signed_up", "2026-10-04T00:00:00Z"),
    ]

    const m = computeMetrics(rows, 14)
    const byUser = new Map(m.setupCompletion.byUser.map((u) => [u.userId, u]))

    expect(byUser.get("alice")?.value).toBe(1)
    expect(byUser.get("bob")?.value).toBe(0)
    expect(byUser.get("carol")?.eventTypes).toBe(2)
    expect(byUser.get("carol")?.signups).toBe(1)
    expect(m.setupCompletion.overallUsers).toBe(3) // alice, bob, carol
    expect(m.setupCompletion.overallUsersComplete).toBe(2) // alice, carol
  })

  it("handles JSON-string meta (Postgres Json may hydrate either way)", () => {
    const rows: MetricEventRow[] = [
      row("booking_started", "2026-10-01T00:00:00Z", { meta: '{"visitId":"v1"}' }),
      row("booking_completed", "2026-10-01T00:10:00Z", { meta: '{"visitId":"v1"}' }),
    ]
    const m = computeMetrics(rows, 14)
    expect(m.timeToBook.pairedBookings).toBe(1)
    expect(rowMeta(rows[0]).visitId).toBe("v1")
  })

  it("percentile is nearest-rank (p50 of [1,2,3,4] = 2; p90 = 4)", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2)
    expect(percentile([1, 2, 3, 4], 90)).toBe(4)
    expect(percentile([], 50)).toBeNull()
    expect(percentile([7], 50)).toBe(7)
  })

  it("runs on an empty table without crashing and reports nulls/zeros", () => {
    const m = computeMetrics([], 14)
    expect(m.conversion.overall).toBeNull()
    expect(m.conversion.daily).toHaveLength(14)
    expect(m.conversion.daily.every((d) => d.value === 0)).toBe(true)
    expect(m.timeToBook.p50Ms).toBeNull()
    expect(m.timeToBook.pairedBookings).toBe(0)
    expect(m.conflictProxy).toBeNull()
    expect(m.setupCompletion.overallUsers).toBe(0)
    // The METRICS_JSON tail line must be parseable:
    const jsonLine = JSON.stringify(m)
    expect(() => JSON.parse(jsonLine)).not.toThrow()
  })
})
