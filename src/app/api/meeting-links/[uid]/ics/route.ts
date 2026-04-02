import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { generateICS } from "@/lib/calendar-links"

export async function GET(_req: Request, { params }: { params: { uid: string } }) {
  const booking = await prisma.booking.findUnique({
    where: { uid: params.uid },
    include: {
      user: { select: { name: true, email: true } },
    },
  })

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const location = booking.meetingUrl || booking.location
  const icsContent = generateICS({
    uid: booking.uid,
    title: booking.title,
    start: booking.startTime,
    end: booking.endTime,
    description: `Meeting with ${booking.user.name || "Host"}`,
    location,
    organizerName: booking.user.name || undefined,
    organizerEmail: booking.user.email || undefined,
  })

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-${booking.uid}.ics"`,
    },
  })
}
