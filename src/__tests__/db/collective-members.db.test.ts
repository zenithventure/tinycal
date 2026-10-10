// DB-backed tests for EventCollectiveMember (#98). They need a real Postgres
// with all migrations applied, so they only run when TEST_DATABASE_URL is set:
//
//   TEST_DATABASE_URL=postgresql://... npx vitest run src/__tests__/db
//
// Chosen user-delete behavior: STRIP + CASCADE. Deleting a co-host removes
// their membership rows and nothing else — the event type, its owner and its
// bookings are untouched. Deleting the owner removes the event type (existing
// EventType.userId cascade) and with it all memberships.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
const run = describe.skipIf(!url)

run("EventCollectiveMember (real database)", () => {
  let prisma: PrismaClient
  const tag = `ecm-${Date.now()}`
  const ids = { owner: `${tag}-owner`, a: `${tag}-a`, b: `${tag}-b` }
  let eventTypeId: string

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: url! } } })
    for (const [k, id] of Object.entries(ids)) {
      await prisma.user.create({ data: { id, email: `${id}@example.test`, name: k } })
    }
    const et = await prisma.eventType.create({
      data: {
        userId: ids.owner,
        title: "Panel",
        slug: tag,
        isCollective: true,
        collectiveMemberships: { create: [{ userId: ids.a }, { userId: ids.b }] },
      },
    })
    eventTypeId = et.id
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } })
    await prisma.$disconnect()
  })

  it("lists co-hosts through the relation and finds the event via membership", async () => {
    const et = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: { collectiveMemberships: { select: { userId: true } } },
    })
    expect(et!.collectiveMemberships.map((m) => m.userId).sort()).toEqual([ids.a, ids.b].sort())

    const visibleToA = await prisma.eventType.findMany({
      where: { isCollective: true, collectiveMemberships: { some: { userId: ids.a } } },
    })
    expect(visibleToA.map((e) => e.id)).toContain(eventTypeId)
  })

  it("rejects a membership for a user that does not exist (FK)", async () => {
    await expect(
      prisma.eventCollectiveMember.create({ data: { eventTypeId, userId: `${tag}-ghost` } })
    ).rejects.toThrow()
  })

  it("rejects a duplicate membership (composite PK)", async () => {
    await expect(
      prisma.eventCollectiveMember.create({ data: { eventTypeId, userId: ids.a } })
    ).rejects.toThrow()
  })

  it("deleting a co-host strips their membership and keeps the event type", async () => {
    await prisma.user.delete({ where: { id: ids.b } })

    const remaining = await prisma.eventCollectiveMember.findMany({ where: { eventTypeId } })
    expect(remaining.map((m) => m.userId)).toEqual([ids.a])
    expect(await prisma.eventType.findUnique({ where: { id: eventTypeId } })).not.toBeNull()
    // No dangling reference to the deleted user anywhere.
    expect(await prisma.eventCollectiveMember.count({ where: { userId: ids.b } })).toBe(0)
  })

  it("deleting the event type removes its memberships but not the users", async () => {
    await prisma.eventType.delete({ where: { id: eventTypeId } })
    expect(await prisma.eventCollectiveMember.count({ where: { eventTypeId } })).toBe(0)
    expect(await prisma.user.findUnique({ where: { id: ids.a } })).not.toBeNull()
  })
})
