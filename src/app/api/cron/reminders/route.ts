import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendEmail, bookingReminderEmail } from "@/lib/email"
import { sendSMS, bookingReminderSMS } from "@/lib/sms"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

// Called by cron job every 15 minutes
// Sends reminders 1 hour before meetings
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

  // Find bookings starting within the next hour that haven't had reminders sent
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startTime: { gte: now, lte: oneHourFromNow },
      reminderSentAt: null,
    },
    include: { eventType: { include: { user: true } } },
  })

  let emailsSent = 0
  let smsSent = 0

  for (const booking of bookings) {
    const dateTime = format(
      toZonedTime(booking.startTime, booking.bookerTimezone),
      "EEEE, MMMM d 'at' h:mm a"
    )

    // Email reminder
    try {
      await sendEmail({
        to: booking.bookerEmail,
        subject: `Reminder: ${booking.title} in 1 hour`,
        html: bookingReminderEmail({
          name: booking.bookerName,
          eventTitle: booking.title,
          dateTime,
          meetingUrl: booking.meetingUrl || undefined,
        }),
      })
      emailsSent++
    } catch (e) {
      console.error(`Reminder email failed for booking ${booking.id}:`, e)
    }

    // SMS reminder (if phone provided and user is Pro)
    if (booking.bookerPhone && booking.eventType.user.plan === "PRO") {
      try {
        await sendSMS(
          booking.bookerPhone,
          bookingReminderSMS({
            eventTitle: booking.title,
            dateTime,
            meetingUrl: booking.meetingUrl || undefined,
          })
        )
        smsSent++
      } catch (e) {
        console.error(`Reminder SMS failed for booking ${booking.id}:`, e)
      }
    }

    // Mark as sent
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        reminderSentAt: now,
        ...(booking.bookerPhone && { smsReminderSentAt: now }),
      },
    })
  }

  return NextResponse.json({
    processed: bookings.length,
    emailsSent,
    smsSent,
  })
}
