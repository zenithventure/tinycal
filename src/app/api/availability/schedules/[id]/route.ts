import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { validateRules } from "@/lib/availability-validation"

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

    if (rules !== undefined) {
      const err = validateRules(rules)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // All writes go through one transaction so the schedule fields, rules
    // replacement, and User.defaultAvailabilityScheduleId pointer can't drift
    // apart on partial failure.
    const refreshed = await prisma.$transaction(async (tx) => {
      if (isDefault && !existing.isDefault) {
        await tx.availabilitySchedule.updateMany({
          where: { userId: user.id, isDefault: true, id: { not: params.id } },
          data: { isDefault: false },
        })
      }

      await tx.availabilitySchedule.update({
        where: { id: params.id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(isDefault !== undefined && { isDefault }),
        },
      })

      if (rules !== undefined) {
        await tx.availabilityRule.deleteMany({
          where: { availabilityScheduleId: params.id },
        })
        if (rules.length > 0) {
          await tx.availabilityRule.createMany({
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
      }

      // Keep User.defaultAvailabilityScheduleId in sync with isDefault.
      if (isDefault === true) {
        await tx.user.update({
          where: { id: user.id },
          data: { defaultAvailabilityScheduleId: params.id },
        })
      } else if (isDefault === false && existing.isDefault) {
        await tx.user.update({
          where: { id: user.id },
          data: { defaultAvailabilityScheduleId: null },
        })
      }

      return tx.availabilitySchedule.findUnique({
        where: { id: params.id },
        include: { rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
      })
    })

    return NextResponse.json(refreshed)
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

    // Block deletion if the owner still has event types linked — the error
    // message tells them to unlink, which they can only do for their own
    // event types, so scope the count to user.id. Any cross-user link (which
    // shouldn't exist post #55, but isn't enforced at the DB layer) would
    // simply be SET NULL by the FK on delete.
    const linkedEventTypes = await prisma.eventType.count({
      where: { availabilityScheduleId: params.id, userId: user.id },
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
