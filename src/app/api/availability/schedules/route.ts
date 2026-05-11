import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { validateRules } from "@/lib/availability-validation"

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

    if (rules !== undefined) {
      const err = validateRules(rules)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // The unset-default → create → update-pointer trio is wrapped in a
    // transaction so a partial failure can't leave the user with no default.
    const schedule = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.availabilitySchedule.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        })
      }
      const created = await tx.availabilitySchedule.create({
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
      if (isDefault) {
        await tx.user.update({
          where: { id: user.id },
          data: { defaultAvailabilityScheduleId: created.id },
        })
      }
      return created
    })

    return NextResponse.json(schedule, { status: 201 })
  } catch (error) {
    console.error("Error creating schedule:", error)
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 })
  }
}
