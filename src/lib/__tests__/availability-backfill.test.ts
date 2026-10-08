import { describe, it, expect } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { backfillAvailabilitySchedules, MIGRATED_SCHEDULE_NAME } from "@/lib/availability-backfill"

// Minimal in-memory stand-in for the Prisma surface the backfill uses.
function makeFakeDb(seed: { legacy: any[]; users: Record<string, string | null> }) {
  const legacy = seed.legacy
  const users = { ...seed.users }
  const schedules: any[] = []
  const rules: any[] = []
  let n = 0

  const db: any = {
    availability: { findMany: async () => legacy },
    availabilitySchedule: {
      findFirst: async ({ where }: any) => {
        const s = schedules.find((x) => x.userId === where.userId && x.name === where.name)
        return s ? { ...s, rules: rules.filter((r) => r.availabilityScheduleId === s.id) } : null
      },
      create: async ({ data }: any) => {
        const s = { id: `s${++n}`, ...data }
        schedules.push(s)
        return s
      },
      update: async ({ where, data }: any) => Object.assign(schedules.find((s) => s.id === where.id), data),
    },
    availabilityRule: {
      createMany: async ({ data }: any) => {
        rules.push(...data)
        return { count: data.length }
      },
    },
    user: {
      findUnique: async ({ where }: any) =>
        where.id in users ? { defaultAvailabilityScheduleId: users[where.id] } : null,
      update: async ({ where, data }: any) => {
        users[where.id] = data.defaultAvailabilityScheduleId
      },
    },
  }
  db.$transaction = async (fn: any) => fn(db)
  return { db: db as PrismaClient, schedules, rules, users }
}

const row = (userId: string, o: Record<string, any> = {}) => ({
  id: `l-${Math.random()}`,
  userId,
  dayOfWeek: 1,
  date: null,
  startTime: "09:00",
  endTime: "17:00",
  enabled: true,
  ...o,
})

describe("backfillAvailabilitySchedules", () => {
  it("copies valid enabled legacy rows into a default migrated schedule", async () => {
    const f = makeFakeDb({
      users: { u1: null },
      legacy: [
        row("u1", { dayOfWeek: 1 }),
        row("u1", { dayOfWeek: 2 }),
        row("u1", { dayOfWeek: null, date: new Date("2026-03-10T00:00:00.000Z"), startTime: "10:00", endTime: "12:00" }),
      ],
    })
    const res = await backfillAvailabilitySchedules(f.db)

    expect(res).toMatchObject({ usersProcessed: 1, rulesCreated: 3, rulesSkippedInvalid: 0 })
    expect(f.schedules).toHaveLength(1)
    expect(f.schedules[0]).toMatchObject({ userId: "u1", name: MIGRATED_SCHEDULE_NAME, isDefault: true })
    expect(f.users.u1).toBe(f.schedules[0].id)
    const dateRule = f.rules.find((r) => r.date)
    expect(dateRule.date.toISOString()).toBe("2026-03-10T00:00:00.000Z")
    expect(dateRule.dayOfWeek).toBeNull()
  })

  it("skips disabled and invalid rows", async () => {
    const f = makeFakeDb({
      users: { u1: null },
      legacy: [
        row("u1", { enabled: false }),
        row("u1", { startTime: "17:00", endTime: "09:00" }),
        row("u1", { startTime: "9am" }),
        row("u1", { dayOfWeek: 9 }),
        row("u1", { dayOfWeek: 4 }),
      ],
    })
    const res = await backfillAvailabilitySchedules(f.db)
    expect(res.rulesCreated).toBe(1)
    expect(res.rulesSkippedInvalid).toBe(4)
    expect(f.rules).toHaveLength(1)
  })

  it("is idempotent: a second run creates nothing", async () => {
    const f = makeFakeDb({ users: { u1: null }, legacy: [row("u1", { dayOfWeek: 1 }), row("u1", { dayOfWeek: 2 })] })
    await backfillAvailabilitySchedules(f.db)
    const second = await backfillAvailabilitySchedules(f.db)

    expect(second.rulesCreated).toBe(0)
    expect(second.rulesSkippedDuplicate).toBe(2)
    expect(f.schedules).toHaveLength(1)
    expect(f.rules).toHaveLength(2)
  })

  it("dedupes identical legacy rows", async () => {
    const f = makeFakeDb({ users: { u1: null }, legacy: [row("u1"), row("u1")] })
    const res = await backfillAvailabilitySchedules(f.db)
    expect(res.rulesCreated).toBe(1)
    expect(res.rulesSkippedDuplicate).toBe(1)
  })

  it("does not take over the default when the user already has one", async () => {
    const f = makeFakeDb({ users: { u1: "existing-default" }, legacy: [row("u1")] })
    await backfillAvailabilitySchedules(f.db)
    expect(f.schedules[0].isDefault).toBe(false)
    expect(f.users.u1).toBe("existing-default")
  })

  it("dry run writes nothing", async () => {
    const f = makeFakeDb({ users: { u1: null }, legacy: [row("u1")] })
    const res = await backfillAvailabilitySchedules(f.db, { dryRun: true })
    expect(res.rulesCreated).toBe(1)
    expect(f.schedules).toHaveLength(0)
    expect(f.rules).toHaveLength(0)
  })

  it("skips users with only invalid rows without creating a schedule", async () => {
    const f = makeFakeDb({ users: { u1: null }, legacy: [row("u1", { enabled: false })] })
    const res = await backfillAvailabilitySchedules(f.db)
    expect(res.usersSkipped).toBe(1)
    expect(f.schedules).toHaveLength(0)
  })
})
