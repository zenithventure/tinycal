import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { updateGoogleCalendarEvent, createGoogleCalendarEvent } from "@/lib/calendar/google"
import { updateOutlookCalendarEvent, createOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { triggerWebhooks } from "@/lib/webhooks"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  const { newStartTime } = await req.json()

  const booking = await prisma.booking.findUnique({
    where: { uid: params.uid },
    include: { eventType: { include: { user: true } } },
  })
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (booking.status === "CANCELLED" || booking.status === "RESCHEDULED") {
    return NextResponse.json({ error: "Booking already " + booking.status.toLowerCase() }, { status: 400 })
  }

  const start = new Date(newStartTime)
  const end = new Date(start.getTime() + booking.eventType.duration * 60000)

  // Check for conflicts
  const conflict = await prisma.booking.findFirst({
    where: {
      userId: booking.userId,
      status: { in: ["CONFIRMED", "PENDING"] },
      id: { not: booking.id },
      OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
    },
  })
  if (conflict) return NextResponse.json({ error: "Time slot no longer available" }, { status: 409 })

  // Update existing calendar event in-place (preserves event thread, attendee responses, Meet link)
  let meetingUrl = booking.meetingUrl || undefined
  let meetingId = booking.meetingId || undefined

  let calendarError: string | undefined
  try {
    if (booking.meetingId) {
      // Update the existing event
      if (booking.eventType.location === "GOOGLE_MEET") {
        console.log(`Reschedule: updating Google Calendar event ${booking.meetingId} for user ${booking.userId}`)
        const updated = await updateGoogleCalendarEvent(booking.userId, booking.meetingId, {
          startTime: start,
          endTime: end,
        })
        if (updated) {
          meetingUrl = updated.meetingUrl || meetingUrl
          meetingId = updated.id || meetingId
          console.log("Reschedule: Google Calendar event updated successfully")
        } else {
          // Update returned null — likely token expired or event not found
          // Fall back to creating a new event
          console.warn("Reschedule: Google Calendar update returned null, creating new event")
          const calEvent = await createGoogleCalendarEvent(booking.userId, {
            summary: `${booking.eventType.title} - ${booking.bookerName}`,
            description: `Rescheduled via TinyCal`,
            startTime: start,
            endTime: end,
            attendees: [{ email: booking.bookerEmail }],
            conferenceData: true,
          })
          if (calEvent) {
            meetingUrl = calEvent.meetingUrl || meetingUrl
            meetingId = calEvent.id || meetingId
          } else {
            calendarError = "Failed to update or create Google Calendar event"
          }
        }
      } else if (booking.eventType.location !== "ZOOM") {
        // Outlook
        await updateOutlookCalendarEvent(booking.userId, booking.meetingId, {
          startTime: start,
          endTime: end,
        })
      }
    } else {
      // No existing event — create a new one
      if (booking.eventType.location === "GOOGLE_MEET") {
        const calEvent = await createGoogleCalendarEvent(booking.userId, {
          summary: `${booking.eventType.title} - ${booking.bookerName}`,
          description: `Rescheduled via TinyCal`,
          startTime: start,
          endTime: end,
          attendees: [{ email: booking.bookerEmail }],
          conferenceData: true,
        })
        meetingUrl = calEvent?.meetingUrl || undefined
        meetingId = calEvent?.id || undefined
      }
    }

    // Update Outlook event if connected (separate from Google)
    if (booking.eventType.location !== "GOOGLE_MEET") {
      const outlookConn = await prisma.calendarConnection.findFirst({
        where: { userId: booking.userId, provider: "OUTLOOK" },
      })
      if (outlookConn && !booking.meetingId) {
        await createOutlookCalendarEvent(booking.userId, {
          summary: `${booking.eventType.title} - ${booking.bookerName}`,
          startTime: start,
          endTime: end,
          attendees: [{ email: booking.bookerEmail }],
        })
      }
    }
  } catch (e) {
    console.error("Calendar event update failed during reschedule:", e)
    calendarError = String(e)
  }

  // Update the booking in-place (keep same uid so reschedule/cancel links still work)
  const updatedBooking = await prisma.booking.update({
    where: { uid: params.uid },
    data: {
      startTime: start,
      endTime: end,
      meetingUrl,
      meetingId,
    },
  })

  // Send emails
  const bookerTz = booking.bookerTimezone || "UTC"
  const zonedStart = toZonedTime(start, bookerTz)
  const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // Email to booker
  try {
    await sendEmail({
      to: booking.bookerEmail,
      subject: `Rescheduled: ${booking.eventType.title} with ${booking.eventType.user.name}`,
      html: bookingConfirmationEmail({
        bookerName: booking.bookerName,
        hostName: booking.eventType.user.name || "Host",
        eventTitle: booking.eventType.title,
        dateTime: dateTimeStr,
        timezone: bookerTz,
        location: booking.eventType.location,
        meetingUrl,
        rescheduleUrl: `${appUrl}/reschedule/${updatedBooking.uid}`,
        cancelUrl: `${appUrl}/cancel/${updatedBooking.uid}`,
      }),
    })
  } catch (e) {
    console.error("Booker reschedule email failed:", e)
  }

  // Email to host
  try {
    if (booking.eventType.user.email) {
      await sendEmail({
        to: booking.eventType.user.email,
        subject: `Rescheduled: ${booking.eventType.title} with ${booking.bookerName}`,
        html: bookingConfirmationEmail({
          bookerName: booking.eventType.user.name || "Host",
          hostName: booking.bookerName,
          eventTitle: booking.eventType.title,
          dateTime: dateTimeStr,
          timezone: bookerTz,
          location: booking.eventType.location,
          meetingUrl,
          rescheduleUrl: `${appUrl}/reschedule/${updatedBooking.uid}`,
          cancelUrl: `${appUrl}/cancel/${updatedBooking.uid}`,
        }),
      })
    }
  } catch (e) {
    console.error("Host reschedule email failed:", e)
  }

  await triggerWebhooks(booking.userId, "booking.rescheduled", { old: booking, new: updatedBooking })

  return NextResponse.json({
    ...updatedBooking,
    ...(calendarError && { calendarWarning: "Booking time updated but calendar invite may not have been updated" }),
  })
}
