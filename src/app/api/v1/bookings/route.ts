import { NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { authenticateApiKey, isAuthFailure, applyAuthResponseHeaders } from "@/lib/api-keys/auth"
import { createBooking } from "@/lib/bookings/create"

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

const PostBodySchema = z.object({
  eventTypeId: z.string().min(1),
  startTime: z.string().datetime(),
  bookerName: z.string().min(1),
  bookerEmail: z.string().email(),
  bookerTimezone: z.string().min(1),
  bookerPhone: z.string().nullish(),
  answers: z.unknown().nullish(),
})

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = await createBooking({
    ...parsed.data,
    requireOwnerUserId: auth.user.id,
  })

  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      EVENT_TYPE_NOT_FOUND: "Event type not found",
      FORBIDDEN: "Event type does not belong to this API key's owner",
      CONFLICT: "Time slot no longer available",
    }
    return applyAuthResponseHeaders(
      NextResponse.json({ error: messages[result.error] }, { status: result.status }),
      auth
    )
  }

  return applyAuthResponseHeaders(
    NextResponse.json({ data: result.booking }, { status: 201 }),
    auth
  )
}
