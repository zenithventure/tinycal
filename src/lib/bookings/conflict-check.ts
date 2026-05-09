import prisma from "@/lib/prisma"
import { getConflictingEvents } from "@/lib/calendar/conflict-detection"

interface ConflictCheckOptions {
  eventType: {
    id: string
    userId: string
    isCollective: boolean
    collectiveMembers: string[]
  }
  start: Date
  end: Date
  excludeBookingId?: string
}

// Returns true if any host (owner + collective members) has a conflicting DB
// booking or connected-calendar event overlapping [start, end). Mirrors the
// busy-time check getAvailableSlots performs at slot-listing time so a
// late-arriving co-host conflict can't slip through booking POST.
export async function hasBookingConflict({
  eventType,
  start,
  end,
  excludeBookingId,
}: ConflictCheckOptions): Promise<boolean> {
  const hostIds = eventType.isCollective
    ? [eventType.userId, ...eventType.collectiveMembers]
    : [eventType.userId]

  const uniqueHostIds = Array.from(new Set(hostIds))

  const results = await Promise.all(
    uniqueHostIds.map(async (userId) => {
      const [dbConflict, calendarBusy] = await Promise.all([
        prisma.booking.findFirst({
          where: {
            userId,
            status: { in: ["CONFIRMED", "PENDING", "PENDING_CONFIRMATION"] },
            ...(excludeBookingId && { id: { not: excludeBookingId } }),
            startTime: { lt: end },
            endTime: { gt: start },
          },
          select: { id: true },
        }),
        getConflictingEvents(userId, start, end, eventType.id),
      ])

      if (dbConflict) return true
      return calendarBusy.some((e) => e.start < end && e.end > start)
    })
  )

  return results.some(Boolean)
}
