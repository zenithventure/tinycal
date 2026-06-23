import { addMinutes, isAfter, isBefore } from "date-fns"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import prisma from "./prisma"
import { getConflictingEvents } from "./calendar/conflict-detection"

interface TimeSlot {
  start: Date
  end: Date
}

interface AvailabilityRuleLike {
  dayOfWeek: number | null
  date: Date | null
  startTime: string
  endTime: string
  enabled: boolean
}

interface AvailabilityOptions {
  userId: string
  eventTypeId: string
  startDate: Date
  endDate: Date
  timezone: string
}

export async function resolveAvailabilityRules(
  userId: string,
  eventType: { availabilityScheduleId: string | null }
): Promise<AvailabilityRuleLike[]> {
  // 1. Event type's linked schedule
  if (eventType.availabilityScheduleId) {
    const rules = await prisma.availabilityRule.findMany({
      where: { availabilityScheduleId: eventType.availabilityScheduleId, enabled: true },
    })
    if (rules.length > 0) return rules
  }

  // 2. User's default schedule
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultAvailabilityScheduleId: true },
  })
  if (user?.defaultAvailabilityScheduleId) {
    const rules = await prisma.availabilityRule.findMany({
      where: { availabilityScheduleId: user.defaultAvailabilityScheduleId, enabled: true },
    })
    if (rules.length > 0) return rules
  }

  // 3. Legacy Availability records
  return prisma.availability.findMany({ where: { userId, enabled: true } })
}

// ─── Resolution reporting ───
//
// resolveAvailabilityRules silently cascades event-type schedule → user-default
// schedule → legacy Availability rows. That's fine for booking math, but the
// dashboard needs to tell users *which* source is winning — otherwise editing
// legacy rows that are being shadowed by a schedule looks like a no-op.
// (See issue #75.)

export type AvailabilitySource =
  | "EVENT_TYPE_SCHEDULE"
  | "USER_DEFAULT_SCHEDULE"
  | "LEGACY_AVAILABILITY"
  | "NONE"

export interface AvailabilitySourceInfo {
  source: AvailabilitySource
  scheduleId: string | null
  scheduleName: string | null
  ruleCount: number
}

export async function describeAvailabilitySource(
  userId: string,
  eventType: { availabilityScheduleId: string | null }
): Promise<AvailabilitySourceInfo> {
  if (eventType.availabilityScheduleId) {
    const [schedule, ruleCount] = await Promise.all([
      prisma.availabilitySchedule.findUnique({
        where: { id: eventType.availabilityScheduleId },
        select: { id: true, name: true },
      }),
      prisma.availabilityRule.count({
        where: { availabilityScheduleId: eventType.availabilityScheduleId, enabled: true },
      }),
    ])
    if (schedule && ruleCount > 0) {
      return {
        source: "EVENT_TYPE_SCHEDULE",
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        ruleCount,
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultAvailabilityScheduleId: true },
  })
  if (user?.defaultAvailabilityScheduleId) {
    const [schedule, ruleCount] = await Promise.all([
      prisma.availabilitySchedule.findUnique({
        where: { id: user.defaultAvailabilityScheduleId },
        select: { id: true, name: true },
      }),
      prisma.availabilityRule.count({
        where: { availabilityScheduleId: user.defaultAvailabilityScheduleId, enabled: true },
      }),
    ])
    if (schedule && ruleCount > 0) {
      return {
        source: "USER_DEFAULT_SCHEDULE",
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        ruleCount,
      }
    }
  }

  const legacyCount = await prisma.availability.count({
    where: { userId, enabled: true },
  })
  if (legacyCount > 0) {
    return {
      source: "LEGACY_AVAILABILITY",
      scheduleId: null,
      scheduleName: null,
      ruleCount: legacyCount,
    }
  }

  return { source: "NONE", scheduleId: null, scheduleName: null, ruleCount: 0 }
}

export interface AvailabilityResolutionSummary {
  defaultSchedule: { id: string; name: string; ruleCount: number } | null
  legacyRuleCount: number
  eventTypes: Array<{
    id: string
    title: string
    slug: string
    source: AvailabilitySource
    scheduleId: string | null
    scheduleName: string | null
  }>
}

export async function getAvailabilityResolutionSummary(
  userId: string
): Promise<AvailabilityResolutionSummary> {
  const [user, eventTypes, legacyRuleCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultAvailabilityScheduleId: true,
        defaultAvailabilitySchedule: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.eventType.findMany({
      where: { userId },
      select: { id: true, title: true, slug: true, availabilityScheduleId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.availability.count({ where: { userId, enabled: true } }),
  ])

  let defaultSchedule: AvailabilityResolutionSummary["defaultSchedule"] = null
  if (user?.defaultAvailabilitySchedule) {
    const ruleCount = await prisma.availabilityRule.count({
      where: {
        availabilityScheduleId: user.defaultAvailabilitySchedule.id,
        enabled: true,
      },
    })
    defaultSchedule = {
      id: user.defaultAvailabilitySchedule.id,
      name: user.defaultAvailabilitySchedule.name,
      ruleCount,
    }
  }

  // Pre-fetch enabled-rule counts for every linked event-type schedule so we
  // avoid an N+1 in describeAvailabilitySource when summarising.
  const linkedScheduleIds = Array.from(
    new Set(
      eventTypes
        .map((et) => et.availabilityScheduleId)
        .filter((id): id is string => !!id)
    )
  )
  const linkedSchedules = linkedScheduleIds.length
    ? await prisma.availabilitySchedule.findMany({
        where: { id: { in: linkedScheduleIds } },
        select: {
          id: true,
          name: true,
          _count: { select: { rules: { where: { enabled: true } } } },
        },
      })
    : []
  const linkedById = new Map(linkedSchedules.map((s) => [s.id, s]))

  const eventTypeSummaries = eventTypes.map((et) => {
    if (et.availabilityScheduleId) {
      const linked = linkedById.get(et.availabilityScheduleId)
      if (linked && linked._count.rules > 0) {
        return {
          id: et.id,
          title: et.title,
          slug: et.slug,
          source: "EVENT_TYPE_SCHEDULE" as const,
          scheduleId: linked.id,
          scheduleName: linked.name,
        }
      }
    }
    if (defaultSchedule && defaultSchedule.ruleCount > 0) {
      return {
        id: et.id,
        title: et.title,
        slug: et.slug,
        source: "USER_DEFAULT_SCHEDULE" as const,
        scheduleId: defaultSchedule.id,
        scheduleName: defaultSchedule.name,
      }
    }
    if (legacyRuleCount > 0) {
      return {
        id: et.id,
        title: et.title,
        slug: et.slug,
        source: "LEGACY_AVAILABILITY" as const,
        scheduleId: null,
        scheduleName: null,
      }
    }
    return {
      id: et.id,
      title: et.title,
      slug: et.slug,
      source: "NONE" as const,
      scheduleId: null,
      scheduleName: null,
    }
  })

  return {
    defaultSchedule,
    legacyRuleCount,
    eventTypes: eventTypeSummaries,
  }
}

export async function getAvailableSlots(options: AvailabilityOptions): Promise<TimeSlot[]> {
  const { userId, eventTypeId, startDate, endDate, timezone: _timezone } = options

  // Get user and event type
  const [user, eventType] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.eventType.findUnique({ where: { id: eventTypeId } }),
  ])

  if (!user || !eventType) return []

  // Resolve availability rules via fallback chain:
  // 1. Event type's linked schedule
  // 2. User's default schedule
  // 3. Legacy Availability records
  const availabilityRules = await resolveAvailabilityRules(userId, eventType)


  const duration = eventType.duration
  const bufferBefore = eventType.bufferBefore
  const bufferAfter = eventType.bufferAfter
  const minNotice = eventType.minNotice
  const now = new Date()
  const earliestBooking = addMinutes(now, minNotice)

  // Get busy times from all calendars with conflict checking enabled, plus existing bookings
  const [calendarConflicts, existingBookings] = await Promise.all([
    getConflictingEvents(userId, startDate, endDate, eventTypeId),
    prisma.booking.findMany({
      where: {
        userId,
        status: { in: ["CONFIRMED", "PENDING"] },
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
      select: { startTime: true, endTime: true },
    }),
  ])

  const busySlots: TimeSlot[] = [
    ...calendarConflicts.map((e) => ({ start: e.start, end: e.end })),
    ...existingBookings.map((b) => ({ start: b.startTime, end: b.endTime })),
  ]

  const tz = user.timezone

  // Check daily/weekly limits
  const dailyBookingCounts = new Map<string, number>()
  if (eventType.dailyLimit || eventType.weeklyLimit) {
    const allBookings = await prisma.booking.findMany({
      where: {
        eventTypeId,
        status: { in: ["CONFIRMED", "PENDING"] },
        // Use overlap logic to catch bookings that span date boundaries
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
    })
    for (const b of allBookings) {
      const dayKey = formatInTimeZone(b.startTime, tz, "yyyy-MM-dd")
      dailyBookingCounts.set(dayKey, (dailyBookingCounts.get(dayKey) || 0) + 1)
    }
  }

  // Walk every calendar day in the host's timezone that overlaps [startDate, endDate].
  // Iterating UTC days here (the previous implementation) misaligned the day-of-week
  // lookup with the timezone-anchored slot times — Tuesday rules ended up anchored
  // on Monday in NY, leaking phantom evening slots onto the next day's view.
  const startDayStr = formatInTimeZone(startDate, tz, "yyyy-MM-dd")
  const endDayStr = formatInTimeZone(new Date(endDate.getTime() - 1), tz, "yyyy-MM-dd")

  const slots: TimeSlot[] = []

  for (let cursor = startDayStr; cursor <= endDayStr; cursor = nextDay(cursor)) {
    const [y, mo, d] = cursor.split("-").map(Number)
    const dayOfWeek = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()

    if (eventType.dailyLimit && (dailyBookingCounts.get(cursor) || 0) >= eventType.dailyLimit) {
      continue
    }

    const dateOverride = availabilityRules.find(
      (r) => r.date && formatInTimeZone(r.date, tz, "yyyy-MM-dd") === cursor
    )
    const dayRules = dateOverride
      ? [dateOverride]
      : availabilityRules.filter((r) => r.dayOfWeek === dayOfWeek && !r.date)

    for (const rule of dayRules) {
      const windowStart = fromZonedTime(`${cursor}T${rule.startTime}:00`, tz)
      const windowEnd = fromZonedTime(`${cursor}T${rule.endTime}:00`, tz)

      let slotStart = windowStart
      while (addMinutes(slotStart, duration) <= windowEnd) {
        const slotEnd = addMinutes(slotStart, duration)
        const blockStart = addMinutes(slotStart, -bufferBefore)
        const blockEnd = addMinutes(slotEnd, bufferAfter)

        if (
          isAfter(slotStart, earliestBooking) &&
          slotStart >= startDate &&
          slotStart < endDate
        ) {
          const hasConflict = busySlots.some(
            (busy) => isBefore(blockStart, busy.end) && isAfter(blockEnd, busy.start)
          )
          if (!hasConflict) {
            slots.push({ start: slotStart, end: slotEnd })
          }
        }

        slotStart = addMinutes(slotStart, 30) // 30-min increments (TD-0009: only :00 and :30)
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime())
  return slots
}

function nextDay(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`
}

export async function initDefaultAvailability(userId: string) {
  const days = [1, 2, 3, 4, 5] // Mon-Fri
  await prisma.availability.createMany({
    data: days.map((day) => ({
      userId,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
      enabled: true,
    })),
  })
}
