import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/lib/calendar/google"
import { createOutlookCalendarEvent, deleteOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { createZoomMeeting } from "@/lib/video"
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

  // Delete old calendar event
  if (booking.meetingId) {
    try {
      if (booking.eventType.location === "GOOGLE_MEET") {
        await deleteGoogleCalendarEvent(booking.userId, booking.meetingId)
      } else {
        await deleteOutlookCalendarEvent(booking.userId, booking.meetingId)
      }
    } catch (e) {
      console.error("Failed to delete old calendar event:", e)
    }
  }

  // Create new calendar event
  let meetingUrl: string | undefined
  let meetingId: string | undefined

  try {
    if (booking.eventType.location === "GOOGLE_MEET") {
      const calEvent = await createGoogleCalendarEvent(booking.userId, {
        summary: `${booking.eventType.title} - ${booking.bookerName}`,
        description: `Rescheduled via SchedulSign`,
        startTime: start,
        endTime: end,
        attendees: [{ email: booking.bookerEmail }],
        conferenceData: true,
      })
      meetingUrl = calEvent?.meetingUrl || undefined
      meetingId = calEvent?.id || undefined
    } else if (booking.eventType.location === "ZOOM") {
      const zoom = await createZoomMeeting({
        topic: `${booking.eventType.title} - ${booking.bookerName}`,
        startTime: start,
        duration: booking.eventType.duration,
      })
      meetingUrl = zoom?.url
      meetingId = zoom?.id
    }

    // Also create Outlook event if connected
    if (booking.eventType.location !== "GOOGLE_MEET") {
      const outlookConn = await prisma.calendarConnection.findFirst({
        where: { userId: booking.userId, provider: "OUTLOOK" },
      })
      if (outlookConn) {
        await createOutlookCalendarEvent(booking.userId, {
          summary: `${booking.eventType.title} - ${booking.bookerName}`,
          startTime: start,
          endTime: end,
          attendees: [{ email: booking.bookerEmail }],
        })
      }
    }
  } catch (e) {
    console.error("Calendar event creation failed during reschedule:", e)
  }

  // Create new booking
  const newBooking = await prisma.booking.create({
    data: {
      eventTypeId: booking.eventTypeId,
      userId: booking.userId,
      title: booking.title,
      startTime: start,
      endTime: end,
      bookerName: booking.bookerName,
      bookerEmail: booking.bookerEmail,
      bookerTimezone: booking.bookerTimezone,
      bookerPhone: booking.bookerPhone,
      location: booking.location,
      meetingUrl,
      meetingId,
      answers: booking.answers as any,
      status: "CONFIRMED",
      rescheduleUid: booking.uid,
    },
  })

  // Mark old booking as rescheduled
  await prisma.booking.update({
    where: { uid: params.uid },
    data: { status: "RESCHEDULED" },
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
        rescheduleUrl: `${appUrl}/reschedule/${newBooking.uid}`,
        cancelUrl: `${appUrl}/cancel/${newBooking.uid}`,
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
          rescheduleUrl: `${appUrl}/reschedule/${newBooking.uid}`,
          cancelUrl: `${appUrl}/cancel/${newBooking.uid}`,
        }),
      })
    }
  } catch (e) {
    console.error("Host reschedule email failed:", e)
  }

  await triggerWebhooks(booking.userId, "booking.rescheduled", { old: booking, new: newBooking })

  return NextResponse.json(newBooking)
}
