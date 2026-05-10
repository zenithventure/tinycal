import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const eventType = await prisma.eventType.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      questions: { orderBy: { order: "asc" } },
      availabilitySchedule: { select: { id: true, name: true } },
    },
  })
  if (!eventType) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Resolve collectiveMembers (User.id[]) to host summaries so the editor
  // can render names instead of raw IDs. Skipped for non-collective event
  // types to avoid a wasted query.
  let collectiveHosts: { id: string; name: string | null; email: string | null }[] = []
  if (eventType.isCollective && eventType.collectiveMembers.length > 0) {
    collectiveHosts = await prisma.user.findMany({
      where: { id: { in: eventType.collectiveMembers } },
      select: { id: true, name: true, email: true },
    })
  }

  return NextResponse.json({ ...eventType, collectiveHosts })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Ownership check — without this, any authed user could mutate any event
  // type by guessing the cuid. Pre-existing gap caught while adding the
  // co-host picker.
  const existing = await prisma.eventType.findUnique({
    where: { id: params.id },
    select: { userId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()

  // If collectiveMembers were sent, reject any IDs that don't resolve to a
  // real user — guards against typos or stale references in the payload.
  if (Array.isArray(body.collectiveMembers) && body.collectiveMembers.length > 0) {
    const found = await prisma.user.count({
      where: { id: { in: body.collectiveMembers } },
    })
    if (found !== body.collectiveMembers.length) {
      return NextResponse.json(
        { error: "One or more collectiveMembers IDs don't resolve to a TinyCal user" },
        { status: 400 }
      )
    }
  }

  const eventType = await prisma.eventType.update({
    where: { id: params.id },
    data: {
      title: body.title,
      description: body.description,
      duration: body.duration,
      location: body.location,
      customLocation: body.customLocation,
      color: body.color,
      active: body.active,
      bufferBefore: body.bufferBefore,
      bufferAfter: body.bufferAfter,
      dailyLimit: body.dailyLimit,
      weeklyLimit: body.weeklyLimit,
      minNotice: body.minNotice,
      maxFutureDays: body.maxFutureDays,
      requirePayment: body.requirePayment,
      price: body.price,
      isCollective: body.isCollective,
      collectiveMembers: body.collectiveMembers,
      ...(body.availabilityScheduleId !== undefined && {
        availabilityScheduleId: body.availabilityScheduleId,
      }),
    },
  })
  return NextResponse.json(eventType)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Same ownership check as PATCH.
  const existing = await prisma.eventType.findUnique({
    where: { id: params.id },
    select: { userId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.eventType.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
