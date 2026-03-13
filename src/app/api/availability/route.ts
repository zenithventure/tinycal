import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// GET /api/availability — returns legacy (non-scheduled) rules for backward compat
// Accepts optional ?scheduleId=... to scope to a specific schedule
export async function GET(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const scheduleId = url.searchParams.get("scheduleId")

  const availability = await prisma.availability.findMany({
    where: {
      userId: user.id,
      scheduleId: scheduleId ?? null, // null = legacy/unscoped rules
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  })
  return NextResponse.json(availability)
}

// PUT /api/availability — replaces rules (legacy or scoped to a schedule)
export async function PUT(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = user.id
  const { rules, scheduleId } = await req.json()

  // Delete existing rules (scoped to schedule or legacy null)
  await prisma.availability.deleteMany({
    where: { userId, scheduleId: scheduleId ?? null },
  })

  if (rules?.length) {
    await prisma.availability.createMany({
      data: rules.map((r: any) => ({
        userId,
        scheduleId: scheduleId ?? null,
        dayOfWeek: r.dayOfWeek,
        date: r.date ? new Date(r.date) : null,
        startTime: r.startTime,
        endTime: r.endTime,
        enabled: r.enabled ?? true,
      })),
    })
  }

  const updated = await prisma.availability.findMany({
    where: { userId, scheduleId: scheduleId ?? null },
    orderBy: [{ dayOfWeek: "asc" }],
  })
  return NextResponse.json(updated)
}
