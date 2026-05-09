import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { meetingLinkInvitationEmail } from "@/lib/email"
import { createGoogleCalendarEvent } from "@/lib/calendar/google"
import { createOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { createZoomMeeting } from "@/lib/video"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { eventTypeId, startTime, recipientName, recipientEmail, recipientNote } = body

    if (!eventTypeId || !startTime) {
      return NextResponse.json({ error: "eventTypeId and startTime are required" }, { status: 400 })
    }

    const eventType = await prisma.eventType.findFirst({
      where: { id: eventTypeId, userId: user.id },
    })
    if (!eventType) return NextResponse.json({ error: "Event type not found" }, { status: 404 })

    const start = new Date(startTime)
    const end = new Date(start.getTime() + eventType.duration * 60000)

    // Check for conflicts
    const conflict = await prisma.booking.findFirst({
      where: {
        userId: user.id,
        status: { in: ["CONFIRMED", "PENDING", "PENDING_CONFIRMATION"] },
        OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
      },
    })
    if (conflict) return NextResponse.json({ error: "You already have a booking at this time" }, { status: 409 })

    // Generate meeting link based on event type location
    let meetingUrl: string | undefined
    let meetingId: string | undefined

    if (eventType.location === "GOOGLE_MEET") {
      const calEvent = await createGoogleCalendarEvent(user.id, {
        summary: `${eventType.title}${recipientName ? ` - ${recipientName}` : ""}`,
        description: "Created via TinyCal meeting link",
        startTime: start,
        endTime: end,
        attendees: recipientEmail ? [{ email: recipientEmail }] : [],
        conferenceData: true,
      })
      meetingUrl = calEvent?.meetingUrl || undefined
      meetingId = calEvent?.id || undefined
    } else if (eventType.location === "ZOOM") {
      const zoom = await createZoomMeeting({
        topic: `${eventType.title}${recipientName ? ` - ${recipientName}` : ""}`,
        startTime: start,
        duration: eventType.duration,
      })
      meetingUrl = zoom?.url
      meetingId = zoom?.id
    }

    // Create booking with PENDING_CONFIRMATION status
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        userId: user.id,
        title: eventType.title,
        startTime: start,
        endTime: end,
        bookerName: recipientName || "Pending",
        bookerEmail: recipientEmail || "",
        bookerTimezone: user.timezone,
        location: eventType.location,
        meetingUrl,
        meetingId,
        status: "PENDING_CONFIRMATION",
        source: "MEETING_LINK",
        recipientNote: recipientNote || null,
      },
    })

    // Create Outlook event if connected and not Google Meet
    if (eventType.location !== "GOOGLE_MEET") {
      const outlookConn = await prisma.calendarConnection.findFirst({
        where: { userId: user.id, provider: "OUTLOOK" },
      })
      if (outlookConn) {
        await createOutlookCalendarEvent(user.id, {
          summary: `${eventType.title}${recipientName ? ` - ${recipientName}` : ""}`,
          startTime: start,
          endTime: end,
          attendees: recipientEmail ? [{ email: recipientEmail }] : [],
        })
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    const shareUrl = `${appUrl}/m/${booking.uid}`

    // Send invitation email if recipient email provided
    if (recipientEmail) {
      try {
        const zonedStart = toZonedTime(start, user.timezone)
        const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")

        await sendEmail({
          to: recipientEmail,
          subject: `${user.name || "Someone"} invited you to: ${eventType.title}`,
          html: meetingLinkInvitationEmail({
            recipientName: recipientName || "there",
            hostName: user.name || "Your host",
            eventTitle: eventType.title,
            dateTime: dateTimeStr,
            timezone: user.timezone,
            duration: eventType.duration,
            note: recipientNote,
            confirmUrl: shareUrl,
          }),
        })
      } catch (e) {
        console.error("Meeting link invitation email failed:", e)
      }
    }

    return NextResponse.json({ booking, shareUrl })
  } catch (error) {
    console.error("Meeting link creation error:", error)
    return NextResponse.json({ error: "Failed to create meeting link" }, { status: 500 })
  }
}
