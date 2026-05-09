import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingCancelledEmail } from "@/lib/email"
import { deleteGoogleCalendarEvent } from "@/lib/calendar/google"
import { triggerWebhooks } from "@/lib/webhooks"
import { buildBookingPayload } from "@/lib/webhooks/booking-payload"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  const { reason } = await req.json().catch(() => ({ reason: undefined }))

  const booking = await prisma.booking.findUnique({
    where: { uid: params.uid },
    include: { eventType: { include: { user: true } } },
  })
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (booking.status === "CANCELLED") return NextResponse.json({ error: "Already cancelled" }, { status: 400 })

  await prisma.booking.update({
    where: { uid: params.uid },
    data: { status: "CANCELLED", cancelReason: reason },
  })

  // Delete calendar event
  if (booking.meetingId) {
    await deleteGoogleCalendarEvent(booking.userId, booking.meetingId)
  }

  // Notify
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
        reason,
      }),
    })
    await sendEmail({
      to: booking.eventType.user.email!,
      subject: `Booking cancelled: ${booking.title} with ${booking.bookerName}`,
      html: bookingCancelledEmail({
        name: booking.eventType.user.name || "Host",
        eventTitle: booking.title,
        dateTime: dateTimeStr,
        reason,
      }),
    })
  } catch (e) {
    console.error("Cancel email failed:", e)
  }

  const payload = await buildBookingPayload(booking.id)
  if (payload) await triggerWebhooks(booking.userId, "booking.cancelled", payload)

  return NextResponse.json({ success: true })
}
