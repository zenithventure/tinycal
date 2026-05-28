import type { Booking, EventType, User } from "@prisma/client"
import prisma from "@/lib/prisma"
import { sendEmail, bookingConfirmationEmail } from "@/lib/email"
import { createGoogleCalendarEvent } from "@/lib/calendar/google"
import { createOutlookCalendarEvent } from "@/lib/calendar/outlook"
import { createZoomMeeting } from "@/lib/video"
import { triggerWebhooks } from "@/lib/webhooks"
import { buildBookingPayload } from "@/lib/webhooks/booking-payload"
import { hasBookingConflict } from "./conflict-check"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export interface CreateBookingInput {
  eventTypeId: string
  startTime: Date | string
  bookerName: string
  bookerEmail: string
  bookerTimezone: string
  bookerPhone?: string | null
  answers?: unknown
  // If set, the helper enforces eventType.userId === requireOwnerUserId.
  // Used by the v1 API so an API-key holder can only book their own
  // event types. Public booking-page POST omits this.
  requireOwnerUserId?: string
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | {
      ok: false
      error: "EVENT_TYPE_NOT_FOUND" | "FORBIDDEN" | "CONFLICT"
      status: number
    }

// Single source of truth for booking creation. Used by the public booking-page
// POST and the authenticated /api/v1/bookings POST. Handles conflict checking
// (across all hosts for collective event types), calendar event + meeting link
// generation, contact upsert, confirmation emails, and webhook fanout.
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: input.eventTypeId },
    include: { user: true },
  })
  if (!eventType) {
    return { ok: false, error: "EVENT_TYPE_NOT_FOUND", status: 404 }
  }

  if (input.requireOwnerUserId && eventType.userId !== input.requireOwnerUserId) {
    return { ok: false, error: "FORBIDDEN", status: 403 }
  }

  const start = typeof input.startTime === "string" ? new Date(input.startTime) : input.startTime
  const end = new Date(start.getTime() + eventType.duration * 60000)

  if (await hasBookingConflict({ eventType, start, end })) {
    return { ok: false, error: "CONFLICT", status: 409 }
  }

  const { meetingUrl, meetingId } = await generateMeeting(eventType, input, start, end)

  const booking = await prisma.booking.create({
    data: {
      eventTypeId: eventType.id,
      userId: eventType.userId,
      title: eventType.title,
      startTime: start,
      endTime: end,
      bookerName: input.bookerName,
      bookerEmail: input.bookerEmail,
      bookerTimezone: input.bookerTimezone,
      bookerPhone: input.bookerPhone ?? null,
      location: eventType.location,
      meetingUrl,
      meetingId,
      answers: (input.answers ?? null) as any,
      status: eventType.requirePayment ? "PENDING" : "CONFIRMED",
    },
  })

  await prisma.contact.upsert({
    where: { userId_email: { userId: eventType.userId, email: input.bookerEmail } },
    update: { name: input.bookerName, phone: input.bookerPhone ?? null },
    create: {
      userId: eventType.userId,
      name: input.bookerName,
      email: input.bookerEmail,
      phone: input.bookerPhone ?? null,
      source: "booking",
    },
  })

  await sendConfirmationEmails(eventType, booking, input.bookerTimezone, start)
  await fanoutWebhooks(eventType.userId, booking.id)
  await maybeCreateOutlookEvent(eventType, booking, start, end, input.bookerEmail)

  return { ok: true, booking }
}

// ── helpers, kept private to avoid widening the module surface ──

async function generateMeeting(
  eventType: EventType & { user: User },
  input: CreateBookingInput,
  start: Date,
  end: Date
): Promise<{ meetingUrl?: string; meetingId?: string }> {
  if (eventType.location === "GOOGLE_MEET") {
    // For collective event types, add co-hosts as Google attendees on the
    // owner's event so Google sends them an invite, surfaces the Meet link,
    // and (once they accept) drops the event onto their primary calendar —
    // which is what getConflictingEvents reads for future scans. Without
    // this, only the owner ever sees the meeting and co-hosts can be
    // double-booked because their calendar holds nothing about it.
    const coHostEmails = await getCollectiveCoHostEmails(eventType)
    const calEvent = await createGoogleCalendarEvent(eventType.userId, {
      summary: `${eventType.title} - ${input.bookerName}`,
      description: `Booked via TinyCal`,
      startTime: start,
      endTime: end,
      attendees: [
        { email: input.bookerEmail },
        ...coHostEmails.map((email) => ({ email })),
      ],
      conferenceData: true,
    })
    return { meetingUrl: calEvent?.meetingUrl ?? undefined, meetingId: calEvent?.id ?? undefined }
  }
  if (eventType.location === "ZOOM") {
    const zoom = await createZoomMeeting({
      topic: `${eventType.title} - ${input.bookerName}`,
      startTime: start,
      duration: eventType.duration,
    })
    return { meetingUrl: zoom?.url, meetingId: zoom?.id }
  }
  return {}
}

async function sendConfirmationEmails(
  eventType: EventType & { user: User },
  booking: Booking,
  bookerTimezone: string,
  start: Date
) {
  const zonedStart = toZonedTime(start, bookerTimezone)
  const dateTimeStr = format(zonedStart, "EEEE, MMMM d, yyyy 'at' h:mm a")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  try {
    await sendEmail({
      to: booking.bookerEmail,
      subject: `Confirmed: ${eventType.title} with ${eventType.user.name}`,
      html: bookingConfirmationEmail({
        bookerName: booking.bookerName,
        hostName: eventType.user.name || "Host",
        eventTitle: eventType.title,
        dateTime: dateTimeStr,
        timezone: bookerTimezone,
        location: eventType.location,
        meetingUrl: booking.meetingUrl ?? undefined,
        rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
        cancelUrl: `${appUrl}/cancel/${booking.uid}`,
      }),
    })
  } catch (e) {
    console.error("Email send failed:", e)
  }

  // Owner + collective co-hosts all need a "new booking" notification. Google
  // Calendar will email attendees when conferenceData is created, but only if
  // the co-host's email is on a Google-hosted mailbox; routing through our
  // own template ensures everyone gets a TinyCal-styled confirmation with
  // reschedule/cancel links regardless of provider.
  const coHostEmails = await getCollectiveCoHostEmails(eventType)
  const hostEmails = [eventType.user.email, ...coHostEmails].filter(
    (e): e is string => Boolean(e)
  )
  const uniqueHostEmails = Array.from(new Set(hostEmails))

  for (const hostEmail of uniqueHostEmails) {
    try {
      await sendEmail({
        to: hostEmail,
        subject: `New booking: ${eventType.title} with ${booking.bookerName}`,
        html: bookingConfirmationEmail({
          bookerName: eventType.user.name || "Host",
          hostName: booking.bookerName,
          eventTitle: eventType.title,
          dateTime: dateTimeStr,
          timezone: bookerTimezone,
          location: eventType.location,
          meetingUrl: booking.meetingUrl ?? undefined,
          rescheduleUrl: `${appUrl}/reschedule/${booking.uid}`,
          cancelUrl: `${appUrl}/cancel/${booking.uid}`,
        }),
      })
    } catch (e) {
      console.error("Host email send failed:", e)
    }
  }
}

// Resolve a collective event type's co-host user IDs to their email addresses,
// dropping any that don't have one on record. Returns [] for non-collective
// event types or when the member list is empty — safe to call unconditionally.
async function getCollectiveCoHostEmails(
  eventType: EventType & { user: User }
): Promise<string[]> {
  if (!eventType.isCollective || eventType.collectiveMembers.length === 0) {
    return []
  }
  const coHosts = await prisma.user.findMany({
    where: { id: { in: eventType.collectiveMembers } },
    select: { email: true },
  })
  return coHosts.map((u) => u.email).filter((e): e is string => Boolean(e))
}

async function fanoutWebhooks(userId: string, bookingId: string) {
  const payload = await buildBookingPayload(bookingId)
  if (payload) await triggerWebhooks(userId, "booking.created", payload)
}

async function maybeCreateOutlookEvent(
  eventType: EventType & { user: User },
  booking: Booking,
  start: Date,
  end: Date,
  bookerEmail: string
) {
  if (eventType.location === "GOOGLE_MEET") return
  const outlookConn = await prisma.calendarConnection.findFirst({
    where: { userId: eventType.userId, provider: "OUTLOOK" },
  })
  if (!outlookConn) return
  await createOutlookCalendarEvent(eventType.userId, {
    summary: `${eventType.title} - ${booking.bookerName}`,
    startTime: start,
    endTime: end,
    attendees: [{ email: bookerEmail }],
  })
}
