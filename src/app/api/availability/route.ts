import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { validateRules } from "@/lib/availability-validation"
import { ensureDefaultSchedule, normalizeRule, resolveActiveSchedule } from "@/lib/availability-schedule"

// Backward-compatible view over the user's default AvailabilitySchedule: same
// rule-array shape the legacy endpoint returned, now backed by the schedule model.

const ORDER = [{ dayOfWeek: "asc" as const }, { startTime: "asc" as const }]

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { schedule } = await resolveActiveSchedule(user.id)
  if (!schedule) return NextResponse.json([])

  const rules = await prisma.availabilityRule.findMany({
    where: { availabilityScheduleId: schedule.id },
    orderBy: ORDER,
  })
  return NextResponse.json(rules)
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rules } = await req.json()
  const err = validateRules(rules ?? [])
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const schedule = await ensureDefaultSchedule(user.id)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.availabilityRule.deleteMany({ where: { availabilityScheduleId: schedule.id } })
    if (rules?.length) {
      await tx.availabilityRule.createMany({
        data: rules.map((r: any) => ({ ...normalizeRule(r), availabilityScheduleId: schedule.id })),
      })
    }
    return tx.availabilityRule.findMany({
      where: { availabilityScheduleId: schedule.id },
      orderBy: ORDER,
    })
  })
  return NextResponse.json(updated)
}
