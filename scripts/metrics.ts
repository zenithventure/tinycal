#!/usr/bin/env tsx
/**
 * @module scripts/metrics
 *
 * Prints the four trust metrics from the self-hosted `AnalyticsEvent` table
 * (#116). No vendor, self-hosted, safe to run without extra env: it only needs
 * DATABASE_URL from the existing .env (falls back to .env if unset).
 *
 * Usage:
 *   npx tsx scripts/metrics.ts --days 14
 *
 * Formulas (last N days, by UTC day of createdAt):
 *   1. booking conversion  = booking_completed / session_started
 *   2. time-to-book p50/p90= (booking_completed − booking_started) paired by
 *                             meta.visitId where the pair is shareable
 *   3. conflict proxy      = conflict_found / slot_checked
 *   4. setup completion    = event_type_created / user_signed_up, per user
 *
 * The final stdout line is the stable machine-readable tail for copy-paste:
 *   METRICS_JSON {"windowDays":14, ...}
 */
import { PrismaClient } from "@prisma/client"
import { computeMetrics, metricsToStableJson, type MetricEventRow } from "../src/lib/metrics"

function parseDays(argv: string[]): number {
  const idx = argv.indexOf("--days")
  if (idx === -1) return 14
  const raw = argv[idx + 1]
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) {
    console.error(`Invalid --days value: ${raw ?? "(missing)"}`)
    process.exit(2)
  }
  return Math.min(n, 730)
}

async function main() {
  const days = parseDays(process.argv.slice(2))
  const since = new Date(Date.now() - days * 86_400_000)

  const prisma = new PrismaClient()
  try {
    // Bounded scan: only the window we report on. The (type, createdAt)
    // index serves this; the raw take() keeps the query bounded even if the
    // window is large.
    const EVENTS_HARD_CAP = 100_000
    const events = await prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: EVENTS_HARD_CAP,
      select: { type: true, userId: true, meta: true, createdAt: true },
    })

    const metrics = computeMetrics(events as unknown as MetricEventRow[], days)

    const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round((v as number) * 100)}%`)
    const ms = (v: number | null) => (v === null ? "n/a" : `${(v as number) / 1000}s`)

    console.log(`TinyCal trust metrics — last ${days} day(s) (since ${since.toISOString()})`)
    console.log(`  1. Booking conversion (completed / sessions):       ${pct(metrics.conversion.overall)}`)
    for (const d of metrics.conversion.daily) {
      if (d.numerator || d.denominator) {
        console.log(`      ${d.day}: ${d.numerator}/${d.denominator}`)
      }
    }
    console.log(
      `  2. Time-to-book p50 / p90 (${metrics.timeToBook.pairedBookings} visitId pair(s)): ${ms(metrics.timeToBook.p50Ms)} / ${ms(metrics.timeToBook.p90Ms)}`
    )
    console.log(`  3. Conflict proxy (conflict_found / slot_checked):  ${pct(metrics.conflictProxy)}`)
    console.log(
      `  4. Setup completion (event_type_created / user_signed_up, per user): ` +
        `${metrics.setupCompletion.overallUsersComplete}/${metrics.setupCompletion.overallUsers} users fully set up`
    )
    for (const u of metrics.setupCompletion.byUser) {
      console.log(`      ${u.userId}: eventTypes=${u.eventTypes} signups=${u.signups}`)
    }
    console.log("")
    console.log(`METRICS_JSON ${metricsToStableJson(metrics)}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  // If the DB is unreachable the script still exits with the JSON tail line
  // (all zeros) so cron/automation parsing never breaks on startup churn —
  // but only when the failure is a database connection error.
  const message = err instanceof Error ? err.message : String(err)
  if (/database|connection|prisma/i.test(message) && !process.argv.includes("--strict")) {
    console.error(`[metrics] database unavailable; emitting zeroed metrics (${message.split("\n")[0]})`)
    const zero = {
      windowDays: parseDays(process.argv.slice(2)),
      bookingConversion: { overall: 0, daily: [] },
      timeToBook: { p50Ms: null, p90Ms: null, pairedBookings: 0 },
      conflictProxy: 0,
      setupCompletion: {
        daily: [],
        byUser: [],
        overallUsers: 0,
        overallUsersComplete: 0,
      },
    }
    console.log(`METRICS_JSON ${JSON.stringify(zero)}`)
    process.exit(0)
  }
  console.error(err)
  process.exit(1)
})
