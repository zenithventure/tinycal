// One-way, idempotent copy of legacy `Availability` rows into AvailabilitySchedule
// (#96). Code no longer reads or writes the legacy table; the table itself is
// intentionally left in the schema so this can be re-run and rolled back safely.

import type { PrismaClient } from "@prisma/client"
import { ruleKey, normalizeRule } from "./availability-schedule"

export const MIGRATED_SCHEDULE_NAME = "Migrated availability"

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

interface LegacyRow {
  dayOfWeek: number | null
  date: Date | null
  startTime: string
  endTime: string
  enabled: boolean
}

export interface BackfillResult {
  usersProcessed: number
  usersSkipped: number
  rulesCreated: number
  rulesSkippedInvalid: number
  rulesSkippedDuplicate: number
}

export function isValidLegacyRow(r: LegacyRow): boolean {
  if (!r.enabled) return false
  if (!HH_MM.test(r.startTime) || !HH_MM.test(r.endTime) || r.startTime >= r.endTime) return false
  if (r.date) return !Number.isNaN(r.date.getTime())
  return Number.isInteger(r.dayOfWeek) && (r.dayOfWeek as number) >= 0 && (r.dayOfWeek as number) <= 6
}

export async function backfillAvailabilitySchedules(
  db: PrismaClient,
  opts: { dryRun?: boolean } = {}
): Promise<BackfillResult> {
  const result: BackfillResult = {
    usersProcessed: 0,
    usersSkipped: 0,
    rulesCreated: 0,
    rulesSkippedInvalid: 0,
    rulesSkippedDuplicate: 0,
  }

  const legacy = await db.availability.findMany({
    orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
  })
  const byUser = new Map<string, LegacyRow[]>()
  for (const row of legacy) {
    const list = byUser.get(row.userId) ?? []
    list.push(row)
    byUser.set(row.userId, list)
  }

  for (const [userId, rows] of Array.from(byUser.entries())) {
    const valid = rows.filter(isValidLegacyRow)
    result.rulesSkippedInvalid += rows.length - valid.length
    if (valid.length === 0) {
      result.usersSkipped++
      continue
    }

    // Dedupe within the legacy rows themselves too.
    const wanted = new Map<string, LegacyRow>()
    for (const r of valid) {
      const k = ruleKey(r)
      if (wanted.has(k)) result.rulesSkippedDuplicate++
      else wanted.set(k, r)
    }

    const existingSchedule = await db.availabilitySchedule.findFirst({
      where: { userId, name: MIGRATED_SCHEDULE_NAME },
      include: { rules: true },
    })
    const have = new Set((existingSchedule?.rules ?? []).map(ruleKey))
    const toCreate = Array.from(wanted.entries())
      .filter(([k]) => !have.has(k))
      .map(([, r]) => normalizeRule(r))
    result.rulesSkippedDuplicate += wanted.size - toCreate.length

    result.usersProcessed++
    result.rulesCreated += toCreate.length
    if (opts.dryRun || (existingSchedule && toCreate.length === 0)) continue

    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { defaultAvailabilityScheduleId: true },
      })
      if (!user) return
      // Legacy rows were the effective availability only when no default schedule
      // existed, so only then does the migrated schedule become the default.
      const makeDefault = !user.defaultAvailabilityScheduleId
      const schedule =
        existingSchedule ??
        (await tx.availabilitySchedule.create({
          data: { userId, name: MIGRATED_SCHEDULE_NAME, isDefault: makeDefault },
        }))
      await tx.availabilityRule.createMany({
        data: toCreate.map((r) => ({ ...r, availabilityScheduleId: schedule.id })),
      })
      if (makeDefault) {
        await tx.availabilitySchedule.update({ where: { id: schedule.id }, data: { isDefault: true } })
        await tx.user.update({ where: { id: userId }, data: { defaultAvailabilityScheduleId: schedule.id } })
      }
    })
  }

  return result
}
