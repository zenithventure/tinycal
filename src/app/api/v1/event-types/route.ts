import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authenticateApiKey, isAuthFailure, applyAuthResponseHeaders } from "@/lib/api-keys/auth"

export async function GET(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  const slug = new URL(req.url).searchParams.get("slug")

  const eventTypes = await prisma.eventType.findMany({
    where: {
      userId: auth.user.id,
      ...(slug && { slug }),
    },
    include: { questions: true, _count: { select: { bookings: true } } },
  })
  return applyAuthResponseHeaders(NextResponse.json({ data: eventTypes }), auth)
}

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  const body = await req.json()
  const eventType = await prisma.eventType.create({
    data: {
      userId: auth.user.id,
      title: body.title,
      slug: body.slug || body.title.toLowerCase().replace(/\s+/g, "-"),
      description: body.description,
      duration: body.duration || 30,
      location: body.location || "GOOGLE_MEET",
    },
  })
  return applyAuthResponseHeaders(NextResponse.json({ data: eventType }, { status: 201 }), auth)
}
