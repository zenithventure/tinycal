import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(_req: Request, { params }: { params: { uid: string } }) {
  const booking = await prisma.booking.findUnique({
    where: { uid: params.uid },
    select: {
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      bookerName: true,
      bookerEmail: true,
      bookerTimezone: true,
      status: true,
      eventTypeId: true,
      eventType: {
        select: { title: true, duration: true, slug: true },
      },
    },
  })

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(booking)
}
