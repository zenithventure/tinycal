import prisma from "@/lib/prisma"
import { getConflictingEvents } from "@/lib/calendar/conflict-detection"
import { track } from "@/lib/track"

export interface ConflictCheckOptions {
  eventType: {
    id: string
    userId: string
    isCollective: boolean
    collectiveMembers: string[]
  }
  start: Date
  end: Date
  excludeBookingId?: string
  /** Instrumentation context (#116): emit booking-scoped conflict events. */
  bookingId?: string
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
  bookingId,
}: ConflictCheckOptions): Promise<boolean> {
  const checkedStart = Date.now()
  const hostIds = eventType.isCollective
    ? [eventType.userId, ...eventType.collectiveMembers]
    : [eventType.userId]

  const uniqueHostIds = Array.from(new Set(hostIds))

  let eventsChecked = 0
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
      eventsChecked += calendarBusy.length

      if (dbConflict) return true
      return calendarBusy.some((e) => e.start < end && e.end > start)
    })
  )

  const hasConflict = results.some(Boolean)

  // Instrumentation (#116): this conflict check is the "slot check" for the
  // booking path; a found conflict is the double-book proxy numerator.
  // Fire-and-forget — never in the result path. When a bookingId is supplied
  // (bookings/create.ts) this carries booking context; slot-listing callers
  // pass nothing and events stay booking-less.
  void track("slot_checked", {
    userId: eventType.userId,
    bookingId,
    meta: {
      durationMs: Date.now() - checkedStart,
      countChecked: eventsChecked,
    },
  })
  if (hasConflict) {
    void track("conflict_found", {
      userId: eventType.userId,
      bookingId,
      meta: { provider: ["DB_BOOKING", "CONNECTED_CALENDAR"] },
    })
  }

  return hasConflict
}
