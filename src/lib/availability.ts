import { addMinutes, eachDayOfInterval, format, isAfter, isBefore, setHours, setMinutes, startOfDay } from "date-fns"
import { toZonedTime, fromZonedTime } from "date-fns-tz"
import prisma from "./prisma"
import { getConflictingEvents } from "./calendar/conflict-detection"

interface TimeSlot {
  start: Date
  end: Date
}

interface AvailabilityOptions {
  userId: string
  eventTypeId: string
  startDate: Date
  endDate: Date
  timezone: string
}

export async function getAvailableSlots(options: AvailabilityOptions): Promise<TimeSlot[]> {
  const { userId, eventTypeId, startDate, endDate, timezone: _timezone } = options

  // Get user and event type
  const [user, eventType] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.eventType.findUnique({ where: { id: eventTypeId } }),
  ])

  if (!user || !eventType) return []

  // Resolve availability rules:
  // 1. Event type's linked schedule (if set)
  // 2. User's default schedule (if any)
  // 3. Legacy unscoped rules (scheduleId is null)
  let scheduleId: string | null = null
  if (eventType.availabilityScheduleId) {
    scheduleId = eventType.availabilityScheduleId
  } else {
    const defaultSchedule = await prisma.availabilitySchedule.findFirst({
      where: { userId, isDefault: true },
    })
    if (defaultSchedule) scheduleId = defaultSchedule.id
  }

  const availabilityRules = await prisma.availability.findMany({
    where: scheduleId
      ? { scheduleId, enabled: true }
      : { userId, scheduleId: null, enabled: true },
  })

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
      const dayKey = format(b.startTime, "yyyy-MM-dd")
      dailyBookingCounts.set(dayKey, (dailyBookingCounts.get(dayKey) || 0) + 1)
    }
  }

  // Generate slots for each day
  const days = eachDayOfInterval({ start: startDate, end: endDate })
  const slots: TimeSlot[] = []

  for (const day of days) {
    const dayOfWeek = day.getDay()
    const dateStr = format(day, "yyyy-MM-dd")

    // Check daily limit
    if (eventType.dailyLimit && (dailyBookingCounts.get(dateStr) || 0) >= eventType.dailyLimit) {
      continue
    }

    // Find applicable rules (date-specific override or day-of-week)
    const dateOverride = availabilityRules.find(
      (r) => r.date && format(r.date, "yyyy-MM-dd") === dateStr
    )
    const dayRules = dateOverride
      ? [dateOverride]
      : availabilityRules.filter((r) => r.dayOfWeek === dayOfWeek && !r.date)

    for (const rule of dayRules) {
      const [startH, startM] = rule.startTime.split(":").map(Number)
      const [endH, endM] = rule.endTime.split(":").map(Number)

      // Create times in user's timezone, then convert to UTC
      const dayInUserTz = toZonedTime(day, user.timezone)
      const windowStart = fromZonedTime(
        setMinutes(setHours(startOfDay(dayInUserTz), startH), startM),
        user.timezone
      )
      const windowEnd = fromZonedTime(
        setMinutes(setHours(startOfDay(dayInUserTz), endH), endM),
        user.timezone
      )

      // Generate slots within window
      let slotStart = windowStart
      while (addMinutes(slotStart, duration) <= windowEnd) {
        const slotEnd = addMinutes(slotStart, duration)
        const blockStart = addMinutes(slotStart, -bufferBefore)
        const blockEnd = addMinutes(slotEnd, bufferAfter)

        // Check: not in past, not too soon
        if (isAfter(slotStart, earliestBooking)) {
          // Check: no conflicts
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

  return slots
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
