import { NextResponse } from "next/server"
import { getAvailableSlots } from "@/lib/availability"
import prisma from "@/lib/prisma"
import { addDays } from "date-fns"
import { fromZonedTime } from "date-fns-tz"

// Public endpoint — get available slots for a booking page
export async function GET(req: Request) {
  const url = new URL(req.url)
  const eventTypeId = url.searchParams.get("eventTypeId")
  const timezone = url.searchParams.get("timezone") || "UTC"
  const dateStr = url.searchParams.get("date") // YYYY-MM-DD
  const month = url.searchParams.get("month") // YYYY-MM

  if (!eventTypeId) {
    return NextResponse.json({ error: "eventTypeId required" }, { status: 400 })
  }

  const eventType = await prisma.eventType.findUnique({ where: { id: eventTypeId } })
  if (!eventType) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let startDate: Date
  let endDate: Date

  if (dateStr) {
    // Interpret dateStr (YYYY-MM-DD) as the booker's local day, not UTC midnight.
    // Without this, a NY booker selecting May 12 produced a window of
    // May 11 20:00 EDT → May 12 20:00 EDT, leaking the prior day's slots in.
    startDate = fromZonedTime(`${dateStr}T00:00:00`, timezone)
    endDate = addDays(startDate, 1)
  } else if (month) {
    const [y, m] = month.split("-").map(Number)
    startDate = new Date(y, m - 1, 1)
    endDate = new Date(y, m, 0, 23, 59, 59)
  } else {
    startDate = new Date()
    endDate = addDays(startDate, eventType.maxFutureDays)
  }

  // For collective scheduling, find slots available for ALL members
  if (eventType.isCollective && eventType.collectiveMembers.length > 0) {
    const allMemberSlots = await Promise.all(
      [eventType.userId, ...eventType.collectiveMembers].map((uid) =>
        getAvailableSlots({ userId: uid, eventTypeId, startDate, endDate, timezone })
      )
    )

    // Intersect: keep only slots available for all members
    const commonSlots = allMemberSlots[0].filter((slot) =>
      allMemberSlots.every((memberSlots) =>
        memberSlots.some(
          (ms) => ms.start.getTime() === slot.start.getTime() && ms.end.getTime() === slot.end.getTime()
        )
      )
    )
    return NextResponse.json(commonSlots)
  }

  const slots = await getAvailableSlots({
    userId: eventType.userId,
    eventTypeId,
    startDate,
    endDate,
    timezone,
  })

  return NextResponse.json(slots)
}
