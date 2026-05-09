import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { createBooking } from "@/lib/bookings/create"

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
    const result = await createBooking({
      eventTypeId: body.eventTypeId,
      startTime: body.startTime,
      bookerName: body.bookerName,
      bookerEmail: body.bookerEmail,
      bookerTimezone: body.bookerTimezone,
      bookerPhone: body.bookerPhone,
      answers: body.answers,
    })

    if (!result.ok) {
      const messages: Record<typeof result.error, string> = {
        EVENT_TYPE_NOT_FOUND: "Event type not found",
        FORBIDDEN: "Forbidden",
        CONFLICT: "Time slot no longer available",
      }
      return NextResponse.json({ error: messages[result.error] }, { status: result.status })
    }

    return NextResponse.json(result.booking)
  } catch (error) {
    console.error("Booking creation error:", error)
    return NextResponse.json({ error: "Booking failed" }, { status: 500 })
  }
}
