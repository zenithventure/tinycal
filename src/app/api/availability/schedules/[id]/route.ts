import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      _count: { select: { eventTypes: true } },
    },
  })
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(schedule)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, isDefault, rules } = await req.json()

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.availabilitySchedule.updateMany({
      where: { userId: user.id, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  // Replace rules: delete existing, create new
  await prisma.availability.deleteMany({
    where: { scheduleId: params.id },
  })

  const schedule = await prisma.availabilitySchedule.update({
    where: { id: params.id },
    data: {
      name: name?.trim(),
      isDefault,
      rules: rules?.length
        ? {
            create: rules.map((r: any) => ({
              userId: user.id,
              dayOfWeek: r.dayOfWeek,
              date: r.date ? new Date(r.date) : null,
              startTime: r.startTime,
              endTime: r.endTime,
              enabled: r.enabled ?? true,
            })),
          }
        : undefined,
    },
    include: {
      rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      _count: { select: { eventTypes: true } },
    },
  })

  return NextResponse.json(schedule)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
    include: { _count: { select: { eventTypes: true } } },
  })
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (schedule._count.eventTypes > 0) {
    return NextResponse.json(
      { error: "Cannot delete: schedule is assigned to event types" },
      { status: 400 }
    )
  }

  await prisma.availabilitySchedule.delete({ where: { id: params.id } })

  // If we deleted the default, promote the oldest remaining
  if (schedule.isDefault) {
    const oldest = await prisma.availabilitySchedule.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    })
    if (oldest) {
      await prisma.availabilitySchedule.update({
        where: { id: oldest.id },
        data: { isDefault: true },
      })
    }
  }

  return NextResponse.json({ success: true })
}
