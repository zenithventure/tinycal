import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// URL-safe slug. Lowercase letters, digits, hyphens. No leading/trailing
// hyphen. 1–80 chars. Mirrors what the public booking-page route can resolve.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SLUG_LENGTH = 80

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const eventType = await prisma.eventType.findFirst({
    where: { id: params.id, userId: user.id },
    include: { questions: { orderBy: { order: "asc" } } },
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

  if (typeof body.slug === "string") {
    if (body.slug.length === 0 || body.slug.length > MAX_SLUG_LENGTH) {
      return NextResponse.json(
        { error: `slug must be 1–${MAX_SLUG_LENGTH} characters` },
        { status: 400 }
      )
    }
    if (!SLUG_PATTERN.test(body.slug)) {
      return NextResponse.json(
        { error: "slug must contain only lowercase letters, digits, and single hyphens (no leading/trailing hyphens)" },
        { status: 400 }
      )
    }
  }

  try {
    const eventType = await prisma.eventType.update({
      where: { id: params.id },
      data: {
        title: body.title,
        slug: body.slug,
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
      },
    })
    return NextResponse.json(eventType)
  } catch (e) {
    // Unique constraint on @@unique([userId, slug]) — surface a friendly error
    // instead of leaking the Prisma error shape.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "You already have an event type with this slug — pick a different one" },
        { status: 409 }
      )
    }
    throw e
  }
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
