import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { triggerWebhooks } from "@/lib/webhooks"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    const { name, email, timezone } = await req.json()

    if (!name || !email || !timezone) {
      return NextResponse.json({ error: "name, email, and timezone are required" }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { uid: params.uid },
      include: { eventType: { include: { user: true } } },
    })

    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (booking.source !== "MEETING_LINK") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (booking.status !== "PENDING_CONFIRMATION") {
      return NextResponse.json({ error: "This meeting has already been " + booking.status.toLowerCase() }, { status: 400 })
    }

    // Update booking with recipient details
    const updatedBooking = await prisma.booking.update({
      where: { uid: params.uid },
      data: {
        bookerName: name,
        bookerEmail: email,
        bookerTimezone: timezone,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    })

    // Create/update contact
    await prisma.contact.upsert({
      where: { userId_email: { userId: booking.userId, email } },
      update: { name },
      create: {
        userId: booking.userId,
        name,
        email,
        source: "meeting_link",
      },
    })

    // Send confirmation emails
    const zonedStart = toZonedTime(booking.startTime, timezone)
    const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    // Email to recipient
    try {
      await sendEmail({
        to: email,
        subject: `Confirmed: ${booking.eventType.title} with ${booking.eventType.user.name}`,
        html: bookingConfirmationEmail({
          bookerName: name,
          hostName: booking.eventType.user.name || "Host",
          eventTitle: booking.eventType.title,
          dateTime: dateTimeStr,
          timezone,
          location: booking.eventType.location,
          meetingUrl: booking.meetingUrl || undefined,
          rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
          cancelUrl: `${appUrl}/cancel/${booking.uid}`,
        }),
      })
    } catch (e) {
      console.error("Recipient confirmation email failed:", e)
    }

    // Email to host
    try {
      if (booking.eventType.user.email) {
        await sendEmail({
          to: booking.eventType.user.email,
          subject: `${name} confirmed: ${booking.eventType.title}`,
          html: bookingConfirmationEmail({
            bookerName: booking.eventType.user.name || "Host",
            hostName: name,
            eventTitle: booking.eventType.title,
            dateTime: dateTimeStr,
            timezone,
            location: booking.eventType.location,
            meetingUrl: booking.meetingUrl || undefined,
            rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
            cancelUrl: `${appUrl}/cancel/${booking.uid}`,
          }),
        })
      }
    } catch (e) {
      console.error("Host confirmation email failed:", e)
    }

    // Trigger webhooks
    await triggerWebhooks(booking.userId, "booking.created", updatedBooking)

    return NextResponse.json(updatedBooking)
  } catch (error) {
    console.error("Meeting link confirm error:", error)
    return NextResponse.json({ error: "Failed to confirm meeting" }, { status: 500 })
  }
}
