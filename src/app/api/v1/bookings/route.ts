import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authenticateApiKey, isAuthFailure, applyAuthResponseHeaders } from "@/lib/api-keys/auth"

export async function GET(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const bookings = await prisma.booking.findMany({
    where: {
      userId: auth.user.id,
      ...(status && { status: status as any }),
      ...(from && { startTime: { gte: new Date(from) } }),
      ...(to && { endTime: { lte: new Date(to) } }),
    },
    include: { eventType: { select: { title: true, slug: true } } },
    orderBy: { startTime: "desc" },
    take: 100,
  })
  return applyAuthResponseHeaders(NextResponse.json({ data: bookings }), auth)
}
