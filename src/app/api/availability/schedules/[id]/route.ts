import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await prisma.availabilitySchedule.findFirst({
    where: { id: params.id, userId: user.id },
    include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
  })

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
  }

  return NextResponse.json(schedule)
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // Verify ownership
    const existing = await prisma.availabilitySchedule.findFirst({
      where: { id: params.id, userId: user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }

    const body = await req.json()
    const { name, isDefault, rules } = body

    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
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
    if (isDefault && !existing.isDefault) {
      await prisma.availabilitySchedule.updateMany({
        where: { userId: user.id, isDefault: true, id: { not: params.id } },
        data: { isDefault: false },
      })
    }

    // Update the schedule
    const updated = await prisma.availabilitySchedule.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(isDefault !== undefined && { isDefault }),
      },
      include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
    })

    // Update rules if provided
    if (rules !== undefined) {
      // Delete existing rules
      await prisma.availabilityRule.deleteMany({
        where: { availabilityScheduleId: params.id },
      })

      // Create new rules
      if (rules.length > 0) {
        await prisma.availabilityRule.createMany({
          data: rules.map((r: any) => ({
            availabilityScheduleId: params.id,
            dayOfWeek: r.dayOfWeek,
            date: r.date ? new Date(r.date) : null,
            startTime: r.startTime,
            endTime: r.endTime,
            enabled: r.enabled ?? true,
          })),
        })
      }

      // Refresh to get updated rules
      const refreshed = await prisma.availabilitySchedule.findUnique({
        where: { id: params.id },
        include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
      })

      return NextResponse.json(refreshed)
    }

    // If set as default, update user
    if (isDefault) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultAvailabilityScheduleId: params.id },
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating schedule:", error)
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // Verify ownership
    const schedule = await prisma.availabilitySchedule.findFirst({
      where: { id: params.id, userId: user.id },
    })

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }

    // Prevent deletion of default schedule if it's linked to event types
    const linkedEventTypes = await prisma.eventType.count({
      where: { availabilityScheduleId: params.id },
    })

    if (linkedEventTypes > 0) {
      return NextResponse.json(
        { error: "Cannot delete schedule linked to event types. Unlink them first." },
        { status: 400 }
      )
    }

    // If this was the default, clear it
    if (schedule.isDefault) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultAvailabilityScheduleId: null },
      })
    }

    // Delete the schedule (cascade deletes rules)
    await prisma.availabilitySchedule.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting schedule:", error)
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 })
  }
}
