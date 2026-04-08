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
  return NextResponse.json(eventType)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
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

  await prisma.eventType.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
