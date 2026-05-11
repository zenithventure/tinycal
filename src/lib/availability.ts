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
