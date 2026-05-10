/* eslint-disable no-console */
// One-off diagnostic for the P3009 failed-migration block on prod (silent-pond).
// Reports: (a) which of the AvailabilitySchedule tables exist, and (b) the
// _prisma_migrations row for the blocked migration. Use the output to decide
// between `prisma migrate resolve --applied` (forward) and --rolled-back
// (backward, if schema is clean).
import { PrismaClient } from "@prisma/client"

async function main() {
  const prisma = new PrismaClient()
  try {
    const tables: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('AvailabilitySchedule', 'AvailabilityRule')`
    )

    const newColumns: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'EventType' AND column_name = 'availabilityScheduleId') OR
           (table_name = 'User' AND column_name = 'defaultAvailabilityScheduleId')
         )`
    )

    const migrationRow: Array<{
      migration_name: string
      started_at: Date
      finished_at: Date | null
      applied_steps_count: number
      logs: string | null
    }> = await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, applied_steps_count, logs
       FROM _prisma_migrations
       WHERE migration_name = '20260408000000_add_availability_schedules'`
    )

    console.log("Tables present in public schema:")
    console.log(tables.length === 0 ? "  (none)" : tables.map(t => "  " + t.table_name).join("\n"))
    console.log("")
    console.log("New columns added by the migration:")
    console.log(newColumns.length === 0 ? "  (none)" : newColumns.map(c => "  " + c.table_name + "." + c.column_name).join("\n"))
    console.log("")
    console.log("_prisma_migrations row for the failed migration:")
    if (migrationRow.length === 0) {
      console.log("  (no row found — migration was never recorded as started)")
    } else {
      const r = migrationRow[0]
      console.log("  migration_name:        " + r.migration_name)
      console.log("  started_at:            " + r.started_at?.toISOString())
      console.log("  finished_at:           " + (r.finished_at?.toISOString() ?? "NULL (partial)"))
      console.log("  applied_steps_count:   " + r.applied_steps_count)
      if (r.logs) console.log("  logs:\n" + r.logs.split("\n").map(l => "    " + l).join("\n"))
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
