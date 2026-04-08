import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedules = await prisma.availabilitySchedule.findMany({
    where: { userId: user.id },
    include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(schedules)
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { name, isDefault, rules } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Schedule name is required" }, { status: 400 })
    }

    // Validate rules if provided
    if (rules && Array.isArray(rules)) {
      for (const rule of rules) {
        if (!rule.startTime || !rule.endTime) {
          return NextResponse.json(
            { error: "Each rule must have startTime and endTime" },
            { status: 400 }
          )
        }
      }
    }

    // If setting as default, unset any previous default
    if (isDefault) {
      await prisma.availabilitySchedule.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      })
    }

    const schedule = await prisma.availabilitySchedule.create({
      data: {
        userId: user.id,
        name: name.trim(),
        isDefault: isDefault || false,
        rules: rules?.length
          ? {
              create: rules.map((r: any) => ({
                dayOfWeek: r.dayOfWeek,
                date: r.date ? new Date(r.date) : null,
                startTime: r.startTime,
                endTime: r.endTime,
                enabled: r.enabled ?? true,
              })),
            }
          : undefined,
      },
      include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
    })

    // If set as default, update user
    if (isDefault) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultAvailabilityScheduleId: schedule.id },
      })
    }

    return NextResponse.json(schedule, { status: 201 })
  } catch (error) {
    console.error("Error creating schedule:", error)
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 })
  }
}
