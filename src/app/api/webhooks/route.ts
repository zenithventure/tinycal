import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import crypto from "crypto"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const webhooks = await prisma.webhook.findMany({
    where: { userId: user.id },
  })
  return NextResponse.json(webhooks)
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { url, events } = await req.json()
  const webhook = await prisma.webhook.create({
    data: {
      userId: user.id,
      url,
      events: events || ["booking.created", "booking.cancelled", "booking.rescheduled"],
      secret: crypto.randomBytes(32).toString("hex"),
    },
  })
  return NextResponse.json(webhook)
}

export async function DELETE(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json()
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  // Ownership check — without this, any authed user could delete any other
  // user's webhook by guessing the cuid (#55).
  const existing = await prisma.webhook.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.webhook.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
