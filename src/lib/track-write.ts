/**
 * @module track-write
 *
 * Persistence for `track()` (#116). Kept in its own module so `track.ts`
 * itself stays dependency-free and unit-testable: tests mock THIS module
 * (vi.mock("@/lib/track-write")) and observe exactly what hits the DB without
 * touching the real Prisma client.
 *
 * `track()` treats every write failure as non-fatal (debug log) — reliability
 * > measurement — so a dead database must never break a request.
 */
import prisma from "@/lib/prisma"

export interface TrackEntry {
  type: string
  userId?: string | null
  bookingId?: string | null
  eventType?: string | null
  meta?: unknown
  source?: string | null
}

export async function writeAnalyticsEvent(entry: TrackEntry): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type: entry.type,
      userId: entry.userId ?? null,
      bookingId: entry.bookingId ?? null,
      eventType: entry.eventType ?? null,
      meta: (entry.meta ?? {}) as object,
      source: entry.source ?? null,
    },
  })
}
