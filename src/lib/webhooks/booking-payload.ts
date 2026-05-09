import prisma from "@/lib/prisma"

// Stable, public-facing payload shape for booking.* webhook events.
// Strips internal fields (Stripe IDs, raw DB metadata) and ensures every event
// includes eventType + host info — callers like the Mira concierge bot rely on
// these being present without having to make a second API call.
export interface BookingWebhookPayload {
  booking: {
    id: string
    uid: string
    status: string
    title: string
    startTime: string  // ISO 8601 UTC
    endTime: string    // ISO 8601 UTC
    location: string
    meetingUrl: string | null
    source: string
    booker: {
      name: string
      email: string
      timezone: string
      phone: string | null
    }
    answers: unknown
    cancelReason: string | null
    confirmedAt: string | null
    createdAt: string
  }
  eventType: {
    id: string
    slug: string
    title: string
    duration: number
    isCollective: boolean
  }
  host: {
    id: string
    name: string | null
    email: string | null
  }
  previous?: {
    startTime: string
    endTime: string
  }
}

interface BuildOptions {
  previousStartTime?: Date
  previousEndTime?: Date
}

// Fetches a booking by id and shapes it into the stable webhook payload.
// Returns null if the booking has been deleted by the time we get here (which
// shouldn't normally happen, but webhook fanout is async so we tolerate it).
export async function buildBookingPayload(
  bookingId: string,
  opts: BuildOptions = {}
): Promise<BookingWebhookPayload | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      eventType: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  if (!booking) return null

  const payload: BookingWebhookPayload = {
    booking: {
      id: booking.id,
      uid: booking.uid,
      status: booking.status,
      title: booking.title,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      location: booking.location,
      meetingUrl: booking.meetingUrl,
      source: booking.source,
      booker: {
        name: booking.bookerName,
        email: booking.bookerEmail,
        timezone: booking.bookerTimezone,
        phone: booking.bookerPhone,
      },
      answers: booking.answers,
      cancelReason: booking.cancelReason,
      confirmedAt: booking.confirmedAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
    },
    eventType: {
      id: booking.eventType.id,
      slug: booking.eventType.slug,
      title: booking.eventType.title,
      duration: booking.eventType.duration,
      isCollective: booking.eventType.isCollective,
    },
    host: {
      id: booking.eventType.user.id,
      name: booking.eventType.user.name,
      email: booking.eventType.user.email,
    },
  }

  if (opts.previousStartTime && opts.previousEndTime) {
    payload.previous = {
      startTime: opts.previousStartTime.toISOString(),
      endTime: opts.previousEndTime.toISOString(),
    }
  }

  return payload
}
