import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET /api/availability/schedules — list all schedules with their rules
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedules = await prisma.availabilitySchedule.findMany({
    where: { userId: user.id },
    include: {
      rules: {
        where: { enabled: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
      _count: { select: { eventTypes: true } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  })

  return NextResponse.json(schedules)
}

// POST /api/availability/schedules — create a new schedule
export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, rules, isDefault } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // If setting as default, unset previous default
  if (isDefault) {
    await prisma.availabilitySchedule.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    })
  }

  // Check if this is the first schedule — make it default automatically
  const existingCount = await prisma.availabilitySchedule.count({ where: { userId: user.id } })
  const makeDefault = isDefault || existingCount === 0

  const schedule = await prisma.availabilitySchedule.create({
    data: {
      userId: user.id,
      name: name.trim(),
      isDefault: makeDefault,
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

  return NextResponse.json(schedule, { status: 201 })
}
