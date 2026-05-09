import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { triggerWebhooks } from "@/lib/webhooks"
import { createGoogleCalendarEvent, updateGoogleCalendarEvent } from "@/lib/calendar/google"
import { createOutlookCalendarEvent, updateOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    const { name, email, phone, linkedin, timezone } = await req.json()

    if (!name || !timezone) {
      return NextResponse.json({ error: "name and timezone are required" }, { status: 400 })
    }
    if (!email && !phone && !linkedin) {
      return NextResponse.json({ error: "At least one contact method (email, phone, or LinkedIn) is required" }, { status: 400 })
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
        bookerEmail: email || "",
        bookerTimezone: timezone,
        bookerPhone: phone || null,
        bookerLinkedin: linkedin || null,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    })

    // Create/update contact
    if (email) {
      await prisma.contact.upsert({
        where: { userId_email: { userId: booking.userId, email } },
        update: { name, phone: phone || undefined, linkedin: linkedin || undefined },
        create: {
          userId: booking.userId,
          name,
          email,
          phone: phone || null,
          linkedin: linkedin || null,
          source: "meeting_link",
        },
      })
    } else {
      // No email — create a contact without unique email constraint
      await prisma.contact.create({
        data: {
          userId: booking.userId,
          name,
          phone: phone || null,
          linkedin: linkedin || null,
          source: "meeting_link",
        },
      })
    }

    // Build description with all contact info for the calendar event
    const contactLines: string[] = []
    if (email) contactLines.push(`Email: ${email}`)
    if (phone) contactLines.push(`Phone: ${phone}`)
    if (linkedin) contactLines.push(`LinkedIn: ${linkedin}`)
    const calDescription = `Confirmed by ${name}\n${contactLines.join("\n")}`

    // Update or create calendar event with recipient info
    const calSummary = `${booking.eventType.title} - ${name}`
    const calAttendees = email ? [{ email }] : []

    if (booking.meetingId) {
      // Calendar event exists — update it
      const calendarUpdate = {
        startTime: booking.startTime,
        endTime: booking.endTime,
        summary: calSummary,
        description: calDescription,
        attendees: email ? [{ email }] : undefined,
      }

      if (booking.location === "GOOGLE_MEET") {
        await updateGoogleCalendarEvent(booking.userId, booking.meetingId, calendarUpdate)
      } else {
        const outlookConn = await prisma.calendarConnection.findFirst({
          where: { userId: booking.userId, provider: "OUTLOOK" },
        })
        if (outlookConn) {
          await updateOutlookCalendarEvent(booking.userId, booking.meetingId, calendarUpdate)
        }
      }
    } else {
      // Calendar event was never created (e.g. token expired at creation time) — create it now
      let calResult: { id?: string | null; meetingUrl?: string | null } | null = null

      if (booking.location === "GOOGLE_MEET") {
        calResult = await createGoogleCalendarEvent(booking.userId, {
          summary: calSummary,
          description: calDescription,
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: calAttendees,
          conferenceData: true,
        })
      } else {
        const outlookConn = await prisma.calendarConnection.findFirst({
          where: { userId: booking.userId, provider: "OUTLOOK" },
        })
        if (outlookConn) {
          calResult = await createOutlookCalendarEvent(booking.userId, {
            summary: calSummary,
            description: calDescription,
            startTime: booking.startTime,
            endTime: booking.endTime,
            attendees: calAttendees,
            isOnline: true,
          })
        }
      }

      // Persist the calendar event info on the booking
      if (calResult?.id || calResult?.meetingUrl) {
        await prisma.booking.update({
          where: { uid: params.uid },
          data: {
            meetingId: calResult.id || undefined,
            meetingUrl: calResult.meetingUrl || undefined,
          },
        })
      }
    }

    // Send confirmation emails
    const zonedStart = toZonedTime(booking.startTime, timezone)
    const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    // Email to recipient (only if they provided email)
    if (email) {
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
    }

    // Email to host
    try {
      if (booking.eventType.user.email) {
        const hostContactInfo = contactLines.length > 0 ? `\n\nContact info:\n${contactLines.join("\n")}` : ""
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
