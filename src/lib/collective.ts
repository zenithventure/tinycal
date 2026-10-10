// Collective co-hosts are stored in the EventCollectiveMember join table (#98).
// These helpers keep the rest of the app (and the public API shape) working in
// terms of a plain `collectiveMembers: string[]` of user ids.

export const collectiveMembershipsInclude = {
  collectiveMemberships: {
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  },
} as const

type WithMemberships = { collectiveMemberships: { userId: string }[] }

export function collectiveMemberIds(eventType: WithMemberships): string[] {
  return eventType.collectiveMemberships.map((m) => m.userId)
}

// Flatten the relation into the `collectiveMembers: string[]` shape that API
// consumers (dashboard, conflict check, booking delivery) already expect.
export function withCollectiveMembers<T extends WithMemberships>(
  eventType: T
): Omit<T, "collectiveMemberships"> & { collectiveMembers: string[] } {
  const { collectiveMemberships, ...rest } = eventType
  return { ...rest, collectiveMembers: collectiveMemberships.map((m) => m.userId) }
}

// Nested-write payload that replaces an event type's co-hosts with `userIds`.
export function replaceCollectiveMembers(userIds: string[]) {
  return {
    deleteMany: {},
    create: Array.from(new Set(userIds)).map((userId) => ({ userId })),
  }
}
