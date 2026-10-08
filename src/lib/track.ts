/**
 * @module track
 *
 * Server-only, fire-and-forget analytics instrumentation (#116).
 *
 * Design rules (from the #116 spec):
 * - SERVER-ONLY: imports Prisma (via ./track-write). Never import this from a
 *   client component; the public booking page emits events from the server
 *   render path.
 * - FIRE-AND-FORGET: `track()` never throws and callers do `void track(...)`.
 *   A dead database is logged at debug level and swallowed. Reliability >
 *   measurement — dropping an event must never break a booking.
 * - NO PII: only userId/booking ids plus the per-event fields below.
 *
 * The v1 event list is `TRACK_EVENT_TYPES`. Keep additions to that list
 * deliberate — every new type is a new column of data the metrics script can
 * depend on.
 */
import { writeAnalyticsEvent } from "@/lib/track-write"

/** v1 event types (see the #116 spec — keep in sync). */
export const TRACK_EVENT_TYPES = [
  "session_started",
  "booking_started",
  "booking_completed",
  "booking_failed",
  "slot_checked",
  "conflict_found",
  "booking_cancelled",
  "booking_rescheduled",
  "user_signed_up",
  "event_type_created",
  "event_link_shared",
  "public_page_view",
] as const

export type TrackEventType = (typeof TRACK_EVENT_TYPES)[number]

export interface TrackData {
  userId?: string
  bookingId?: string
  /** Event-type id (analytics `eventType` column, optional). */
  eventType?: string
  /** Source channel: dashboard | booking_page | api | cron | e2e. */
  source?: string
  /** Free-form JSON payload: visitId, durationMs, reason, slug, ... */
  meta?: Record<string, unknown>
}

export interface TrackOptions {
  channel?: "server" | "client"
}

/**
 * Emit an analytics event. NEVER throws: every internal error is caught and
 * logged at debug level (`console.debug`). Fire-and-forget — callers must do
 * `void track(...)`, never `await` it in a request path.
 */
export function track(
  type: TrackEventType,
  data?: TrackData,
  _opts?: TrackOptions
): void {
  if (!TRACK_EVENT_TYPES.includes(type)) {
    console.debug(`[track] skipping unknown event type: ${type}`)
    return
  }
  // The write runs as an unobserved promise. `.catch` is attached inside so
  // even a crash in a future refactor becomes a debug log, never an unhandled
  // rejection, and nothing this writes can leak to the caller.
  writeAnalyticsEvent({
    type,
    userId: data?.userId ?? null,
    bookingId: data?.bookingId ?? null,
    eventType: data?.eventType ?? null,
    meta: data?.meta ?? {},
    source: data?.source ?? null,
  }).catch((err) => {
    console.debug(`[track] failed to write analytics event ${type}:`, err)
  })
}
