/* eslint-disable no-console */
// Recovery for the partial state of 20260408000000_add_availability_schedules.
//
// Before running, verify the diagnostic output matches what we expect:
//   - AvailabilitySchedule table exists (empty)
//   - AvailabilityRule table does NOT exist
//   - EventType.availabilityScheduleId column exists (all NULL)
//   - User.defaultAvailabilityScheduleId column does NOT exist
//
// This script:
//   1. Confirms AvailabilitySchedule is empty (refuses to proceed otherwise)
//   2. Drops the partially-applied table + column with IF EXISTS / CASCADE
//   3. Tells you to run `prisma migrate resolve --rolled-back ...` after
//
// Run:  npx tsx scripts/recover-failed-migration.ts
import { PrismaClient } from "@prisma/client"

const MIGRATION_NAME = "20260408000000_add_availability_schedules"

async function main() {
  const prisma = new PrismaClient()
  try {
    // Safety check — refuse to drop a table that has rows
    const rowCount: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "AvailabilitySchedule"`
    ).catch(() => [{ count: BigInt(-1) }])

    if (rowCount[0].count === BigInt(-1)) {
      console.log("AvailabilitySchedule does not exist — nothing to drop. Proceeding to mark rolled-back.")
    } else if (rowCount[0].count > BigInt(0)) {
      console.error(`REFUSING TO PROCEED: AvailabilitySchedule has ${rowCount[0].count} rows. Manual review required.`)
      process.exit(1)
    } else {
      console.log("AvailabilitySchedule is empty — safe to drop.")
    }

    console.log("\n→ Dropping partially-applied schema objects...")
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "AvailabilityRule" CASCADE`)
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "AvailabilitySchedule" CASCADE`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "EventType" DROP COLUMN IF EXISTS "availabilityScheduleId"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN IF EXISTS "defaultAvailabilityScheduleId"`)
    console.log("  Done.")

    console.log("\n→ Verifying clean state...")
    const tables: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('AvailabilitySchedule','AvailabilityRule')`
    )
    const columns: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name='EventType' AND column_name='availabilityScheduleId')
              OR (table_name='User' AND column_name='defaultAvailabilityScheduleId'))`
    )
    if (tables.length > 0 || columns.length > 0) {
      console.error("  ERROR: residual schema objects remain:", tables, columns)
      process.exit(1)
    }
    console.log("  Clean.")

    console.log("\n→ Next step (run this yourself, NOT this script):")
    console.log(`  npx prisma migrate resolve --rolled-back ${MIGRATION_NAME}`)
    console.log("\nThen re-run the diagnose script to confirm _prisma_migrations row is gone.")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
