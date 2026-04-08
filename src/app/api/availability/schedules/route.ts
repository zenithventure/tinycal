import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedules = await prisma.availabilitySchedule.findMany({
    where: { userId: user.id },
    include: {
      rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      _count: { select: { eventTypes: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(schedules)
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, rules } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // If this is the first schedule, make it default
  const count = await prisma.availabilitySchedule.count({ where: { userId: user.id } })
  const isDefault = count === 0

  const schedule = await prisma.availabilitySchedule.create({
    data: {
      userId: user.id,
      name: name.trim(),
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
    include: { rules: true },
  })

  return NextResponse.json(schedule)
}
