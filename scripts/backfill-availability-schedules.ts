#!/usr/bin/env tsx
/**
 * @module scripts/backfill-availability-schedules
 *
 * One-way, idempotent copy of legacy `Availability` rows into
 * AvailabilitySchedule/AvailabilityRule (#96). Safe to re-run: rules already
 * present in the user's "Migrated availability" schedule are skipped. The legacy
 * table is never modified or dropped.
 *
 * Usage:
 *   npx tsx scripts/backfill-availability-schedules.ts --dry-run
 *   npx tsx scripts/backfill-availability-schedules.ts
 */
import { PrismaClient } from "@prisma/client"
import { backfillAvailabilitySchedules } from "../src/lib/availability-backfill"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const prisma = new PrismaClient()
  try {
    const result = await backfillAvailabilitySchedules(prisma, { dryRun })
    console.log(dryRun ? "[dry run] no changes written" : "backfill complete")
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
