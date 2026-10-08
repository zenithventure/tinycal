// Server-side helpers for the AvailabilitySchedule model (the only availability
// store since the legacy `Availability` table was retired from code, #96).
// Pure helpers live in ./availability-rules and are re-exported here.

import prisma from "./prisma"
import type { ActiveSchedule } from "./availability-rules"

export * from "./availability-rules"

/**
 * The schedule that applies to an event type (or, without one, to the user):
 * event type's linked schedule → user's default schedule → null.
 */
export async function resolveActiveSchedule(
  userId: string,
  eventType?: { availabilityScheduleId: string | null } | null
): Promise<{ schedule: ActiveSchedule | null; viaEventType: boolean }> {
  const select = { id: true, name: true, isDefault: true } as const
  if (eventType?.availabilityScheduleId) {
    const linked = await prisma.availabilitySchedule.findFirst({
      where: { id: eventType.availabilityScheduleId, userId },
      select,
    })
    if (linked) return { schedule: linked, viaEventType: true }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultAvailabilityScheduleId: true },
  })
  if (user?.defaultAvailabilityScheduleId) {
    const def = await prisma.availabilitySchedule.findFirst({
      where: { id: user.defaultAvailabilityScheduleId, userId },
      select,
    })
    if (def) return { schedule: def, viaEventType: false }
  }
  return { schedule: null, viaEventType: false }
}

export const DEFAULT_SCHEDULE_NAME = "Working hours"

/**
 * Create the Mon–Fri 09:00–17:00 default schedule and point the user at it.
 * No-op (returns the existing default) if the user already has one.
 */
export async function ensureDefaultSchedule(userId: string): Promise<ActiveSchedule> {
  const { schedule } = await resolveActiveSchedule(userId)
  if (schedule) return schedule

  return prisma.$transaction(async (tx) => {
    // Reuse a same-named schedule left over from a partial attempt (unique on userId+name).
    const existing = await tx.availabilitySchedule.findFirst({
      where: { userId, name: DEFAULT_SCHEDULE_NAME },
      select: { id: true, name: true, isDefault: true },
    })
    const created =
      existing ??
      (await tx.availabilitySchedule.create({
        data: {
          userId,
          name: DEFAULT_SCHEDULE_NAME,
          isDefault: true,
          rules: {
            create: [1, 2, 3, 4, 5].map((day) => ({
              dayOfWeek: day,
              startTime: "09:00",
              endTime: "17:00",
              enabled: true,
            })),
          },
        },
        select: { id: true, name: true, isDefault: true },
      }))
    if (existing && !existing.isDefault) {
      await tx.availabilitySchedule.update({ where: { id: existing.id }, data: { isDefault: true } })
    }
    await tx.user.update({ where: { id: userId }, data: { defaultAvailabilityScheduleId: created.id } })
    return { ...created, isDefault: true }
  })
}
