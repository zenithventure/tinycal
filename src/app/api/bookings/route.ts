import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { createGoogleCalendarEvent } from "@/lib/calendar/google"
import { createOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { createZoomMeeting } from "@/lib/video"
import { triggerWebhooks } from "@/lib/webhooks"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: { eventType: true },
    orderBy: { startTime: "desc" },
  })
  return NextResponse.json(bookings)
}

// Public booking creation (called from booking page)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { eventTypeId, startTime, bookerName, bookerEmail, bookerTimezone, bookerPhone, answers } = body

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: { user: true },
    })
    if (!eventType) return NextResponse.json({ error: "Event type not found" }, { status: 404 })

    const start = new Date(startTime)
    const end = new Date(start.getTime() + eventType.duration * 60000)

    // Check for conflicts
    const conflict = await prisma.booking.findFirst({
      where: {
        userId: eventType.userId,
        status: { in: ["CONFIRMED", "PENDING"] },
        OR: [
          { startTime: { lt: end }, endTime: { gt: start } },
        ],
      },
    })
    if (conflict) return NextResponse.json({ error: "Time slot no longer available" }, { status: 409 })

    // Generate meeting link
    let meetingUrl: string | undefined
    let meetingId: string | undefined

    if (eventType.location === "GOOGLE_MEET") {
      const calEvent = await createGoogleCalendarEvent(eventType.userId, {
        summary: `${eventType.title} - ${bookerName}`,
        description: `Booked via TinyCal`,
        startTime: start,
        endTime: end,
        attendees: [{ email: bookerEmail }],
        conferenceData: true,
      })
      meetingUrl = calEvent?.meetingUrl || undefined
      meetingId = calEvent?.id || undefined
    } else if (eventType.location === "ZOOM") {
      const zoom = await createZoomMeeting({
        topic: `${eventType.title} - ${bookerName}`,
        startTime: start,
        duration: eventType.duration,
      })
      meetingUrl = zoom?.url
      meetingId = zoom?.id
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        userId: eventType.userId,
        title: eventType.title,
        startTime: start,
        endTime: end,
        bookerName,
        bookerEmail,
        bookerTimezone,
        bookerPhone,
        location: eventType.location,
        meetingUrl,
        meetingId,
        answers,
        status: eventType.requirePayment ? "PENDING" : "CONFIRMED",
      },
    })

    // Create/update contact
    await prisma.contact.upsert({
      where: { userId_email: { userId: eventType.userId, email: bookerEmail } },
      update: { name: bookerName, phone: bookerPhone },
      create: {
        userId: eventType.userId,
        name: bookerName,
        email: bookerEmail,
        phone: bookerPhone,
        source: "booking",
      },
    })

    // Send confirmation emails
    const zonedStart = toZonedTime(start, bookerTimezone)
    const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    try {
      await sendEmail({
        to: bookerEmail,
        subject: `Confirmed: ${eventType.title} with ${eventType.user.name}`,
        html: bookingConfirmationEmail({
          bookerName,
          hostName: eventType.user.name || "Host",
          eventTitle: eventType.title,
          dateTime: dateTimeStr,
          timezone: bookerTimezone,
          location: eventType.location,
          meetingUrl,
          rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
          cancelUrl: `${appUrl}/cancel/${booking.uid}`,
        }),
      })
    } catch (e) {
      console.error("Email send failed:", e)
    }

    // Email to host
    try {
      if (eventType.user.email) {
        await sendEmail({
          to: eventType.user.email,
          subject: `New booking: ${eventType.title} with ${bookerName}`,
          html: bookingConfirmationEmail({
            bookerName: eventType.user.name || "Host",
            hostName: bookerName,
            eventTitle: eventType.title,
            dateTime: dateTimeStr,
            timezone: bookerTimezone,
            location: eventType.location,
            meetingUrl,
            rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
            cancelUrl: `${appUrl}/cancel/${booking.uid}`,
          }),
        })
      }
    } catch (e) {
      console.error("Host email send failed:", e)
    }

    // Trigger webhooks
    await triggerWebhooks(eventType.userId, "booking.created", booking)

    // Also create calendar event in Outlook if connected
    if (eventType.location !== "GOOGLE_MEET") {
      const outlookConn = await prisma.calendarConnection.findFirst({
        where: { userId: eventType.userId, provider: "OUTLOOK" },
      })
      if (outlookConn) {
        await createOutlookCalendarEvent(eventType.userId, {
          summary: `${eventType.title} - ${bookerName}`,
          startTime: start,
          endTime: end,
          attendees: [{ email: bookerEmail }],
        })
      }
    }

    return NextResponse.json(booking)
  } catch (error) {
    console.error("Booking creation error:", error)
    return NextResponse.json({ error: "Booking failed" }, { status: 500 })
  }
}
