import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET /api/availability/schedules/[id]
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
    },
  })

  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(schedule)
}

// PUT /api/availability/schedules/[id] — update name, isDefault, and replace rules
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, isDefault, rules } = await req.json()

  const existing = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // If marking as default, unset other defaults
  if (isDefault && !existing.isDefault) {
    await prisma.availabilitySchedule.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    })
  }

  // Replace rules: delete existing then recreate
  await prisma.availability.deleteMany({ where: { scheduleId: params.id } })

  const schedule = await prisma.availabilitySchedule.update({
    where: { id: params.id },
    data: {
      name: name?.trim() ?? existing.name,
      isDefault: isDefault ?? existing.isDefault,
      rules: rules?.length
        ? {
            create: rules.map((r: any) => ({
              userId: user.id,
              dayOfWeek: r.dayOfWeek ?? null,
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
    },
  })

  return NextResponse.json(schedule)
}

// DELETE /api/availability/schedules/[id]
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Prevent deleting the only/default schedule if event types use it
  const linkedCount = await prisma.eventType.count({
    where: { availabilityScheduleId: params.id },
  })
  if (linkedCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${linkedCount} event type(s) use this schedule. Reassign them first.` },
      { status: 409 }
    )
  }

  await prisma.availabilitySchedule.delete({ where: { id: params.id } })

  // If deleted schedule was default, promote the oldest remaining
  if (existing.isDefault) {
    const next = await prisma.availabilitySchedule.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    })
    if (next) {
      await prisma.availabilitySchedule.update({
        where: { id: next.id },
        data: { isDefault: true },
      })
    }
  }

  return NextResponse.json({ success: true })
}
