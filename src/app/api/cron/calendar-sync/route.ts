import { NextResponse } from "next/server"
import { addDays, addHours, format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { getGoogleCalendarEvent } from "@/lib/calendar/google"
import { sendEmail, bookingCancelledEmail } from "@/lib/email"
import { triggerWebhooks } from "@/lib/webhooks"
import { buildBookingPayload } from "@/lib/webhooks/booking-payload"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

const reconcileInclude = {
  eventType: { include: { user: true } },
} satisfies Prisma.BookingInclude

type ReconcileBooking = Prisma.BookingGetPayload<{ include: typeof reconcileInclude }>

// Reconcile TinyCal bookings against the host's Google Calendar. Detects events
// the host moved or deleted directly in their calendar (outside TinyCal) and
// updates the matching Booking row.
//
// Scope: Google Meet bookings only — those are the ones whose meetingId is
// guaranteed to be a Google calendar event id. Outlook event ids aren't stored
// on Booking today, so Outlook reconcile is a separate task.
//
// 404/410 from Google is treated as ambiguous (could be a stale connection on
// a pre-primary-fix booking) and is logged + skipped rather than auto-cancelled.
// Only an explicit status="cancelled" triggers cancellation.
//
// Recommended schedule: every 15 minutes.
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const windowStart = addHours(now, -1)
  const windowEnd = addDays(now, 14)

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      meetingId: { not: null },
      location: "GOOGLE_MEET",
      endTime: { gte: windowStart, lte: windowEnd },
    },
    include: reconcileInclude,
    take: 200,
  })

  let cancelled = 0
  let rescheduled = 0
  let unchanged = 0
  let skipped = 0
  let errored = 0

  for (const b of bookings) {
    if (!b.meetingId) continue
    const ev = await getGoogleCalendarEvent(b.userId, b.meetingId)

    if (ev.status === "cancelled") {
      await reconcileCancellation(b)
      cancelled++
      continue
    }
    if (ev.status === "not_found") {
      console.warn(
        `[calendar-sync] event ${b.meetingId} not_found for booking ${b.id} — leaving as-is`
      )
      skipped++
      continue
    }
    if (ev.status === "error") {
      console.error(
        `[calendar-sync] error fetching event ${b.meetingId} for booking ${b.id}: ${ev.reason}`
      )
      errored++
      continue
    }

    const moved =
      ev.start.getTime() !== b.startTime.getTime() ||
      ev.end.getTime() !== b.endTime.getTime()
    if (moved) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { startTime: ev.start, endTime: ev.end },
      })
      console.log(
        `[calendar-sync] rescheduled booking ${b.id}: ${b.startTime.toISOString()} → ${ev.start.toISOString()}`
      )
      rescheduled++
    } else {
      unchanged++
    }
  }

  return NextResponse.json({
    processed: bookings.length,
    cancelled,
    rescheduled,
    unchanged,
    skipped,
    errored,
  })
}

async function reconcileCancellation(booking: ReconcileBooking) {
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", cancelReason: "Cancelled in calendar" },
  })

  const dateTimeStr = format(
    toZonedTime(booking.startTime, booking.bookerTimezone),
    "EEEE, MMMM d, yyyy 'at' h:mm a"
  )

  try {
    await sendEmail({
      to: booking.bookerEmail,
      subject: `Cancelled: ${booking.title}`,
      html: bookingCancelledEmail({
        name: booking.bookerName,
        eventTitle: booking.title,
        dateTime: dateTimeStr,
        reason: "Cancelled in calendar",
      }),
    })
    if (booking.eventType.user.email) {
      await sendEmail({
        to: booking.eventType.user.email,
        subject: `Booking cancelled: ${booking.title} with ${booking.bookerName}`,
        html: bookingCancelledEmail({
          name: booking.eventType.user.name || "Host",
          eventTitle: booking.title,
          dateTime: dateTimeStr,
          reason: "Cancelled in calendar",
        }),
      })
    }
  } catch (e) {
    console.error(`[calendar-sync] cancel email failed for booking ${booking.id}:`, e)
  }

  try {
    const payload = await buildBookingPayload(booking.id)
    if (payload) await triggerWebhooks(booking.userId, "booking.cancelled", payload)
  } catch (e) {
    console.error(`[calendar-sync] webhook fanout failed for booking ${booking.id}:`, e)
  }

  console.log(`[calendar-sync] cancelled booking ${booking.id} (event removed from calendar)`)
}
