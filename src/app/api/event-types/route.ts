import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateSlug } from "@/lib/utils"
import { track } from "@/lib/track"
import { requirePro, enforceEventTypeLimit, planGateResponse } from "@/lib/plan"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Co-hosts on a collective event type need to see it in their own dashboard,
  // not just the owner. The booking/slots layer (src/app/api/slots/route.ts)
  // already treats every member as a host, so visibility was the only gap.
  // `isCollective: true` is required so flipping collective scheduling off
  // re-hides the event from former co-hosts.
  const eventTypes = await prisma.eventType.findMany({
    where: {
      OR: [
        { userId: user.id },
        { isCollective: true, collectiveMembers: { has: user.id } },
      ],
    },
    include: {
      questions: { orderBy: { order: "asc" } },
      _count: { select: { bookings: true } },
      user: { select: { id: true, name: true, email: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const decorated = eventTypes.map((et) => ({
    ...et,
    viewerRole: et.userId === user.id ? ("OWNER" as const) : ("CO_HOST" as const),
  }))
  return NextResponse.json(decorated)
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const userId = user.id
  try {
    await enforceEventTypeLimit(user)
    if (body.requirePayment) requirePro(user, "paid_event_types")
  } catch (e) {
    const gated = planGateResponse(e)
    if (gated) return gated
    throw e
  }

  // Ownership check for the optional availability-schedule pointer — without
  // this a user could link their event type to someone else's schedule, which
  // would leak that user's hours via the booking page.
  if (body.availabilityScheduleId) {
    const schedule = await prisma.availabilitySchedule.findFirst({
      where: { id: body.availabilityScheduleId, userId },
      select: { id: true },
    })
    if (!schedule) {
      return NextResponse.json(
        { error: "availabilityScheduleId does not resolve to a schedule you own" },
        { status: 400 }
      )
    }
  }

  const slug = generateSlug(body.title)
  const eventType = await prisma.eventType.create({
    data: {
      userId,
      title: body.title,
      slug,
      description: body.description,
      duration: body.duration || 30,
      location: body.location || "GOOGLE_MEET",
      customLocation: body.customLocation,
      color: body.color,
      bufferBefore: body.bufferBefore || 0,
      bufferAfter: body.bufferAfter || 0,
      dailyLimit: body.dailyLimit,
      weeklyLimit: body.weeklyLimit,
      minNotice: body.minNotice || 120,
      maxFutureDays: body.maxFutureDays || 60,
      requirePayment: body.requirePayment || false,
      price: body.price,
      currency: body.currency || "usd",
      isCollective: body.isCollective || false,
      collectiveMembers: body.collectiveMembers || [],
      availabilityScheduleId: body.availabilityScheduleId,
      questions: body.questions?.length ? {
        create: body.questions.map((q: any, i: number) => ({
          label: q.label,
          type: q.type || "TEXT",
          required: q.required || false,
          options: q.options || [],
          order: i,
        })),
      } : undefined,
    },
    include: { questions: true },
  })

  // #116 setup-completion metric: fires after the event type row is committed.
  // Fire-and-forget (void) — setup UX must never depend on analytics.
  void track("event_type_created", { userId, eventType: eventType.id })

  return NextResponse.json(eventType)
}
