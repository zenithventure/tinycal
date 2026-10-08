import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ─── Mock @/lib/track-write (the persistence boundary) ───────────────────────
//
// `track.ts` itself is pure scheduling: hand the entry to the writer and
// swallow any error. So we mock the writer (not the prisma singleton) and
// assert track's contract: never throws, fire-and-forget, debug-logs failure.

const mockWrite = vi.fn()
vi.mock("@/lib/track-write", () => ({
  writeAnalyticsEvent: (...args: any[]) => mockWrite(...args),
}))

import { track, TRACK_EVENT_TYPES } from "../track"

describe("track() — #116 reliability contract", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
    errSpy.mockRestore()
  })

  it("accepts every v1 event type from the #116 spec list", () => {
    expect(TRACK_EVENT_TYPES).toEqual(
      expect.arrayContaining([
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
      ])
    )
  })

  it("never throws even when the DB write fails (DB down)", async () => {
    mockWrite.mockRejectedValue(new Error("P1001: Can't reach database server"))

    // Synchronous call site — must not synchronously throw either:
    expect(() => track("session_started", { meta: { visitId: "v1" } })).not.toThrow()

    // …and the internal promise must resolve (catch attached) without
    // producing an unhandled rejection or console.error:
    await new Promise((r) => setImmediate(r))
    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()
    // Debug-level logging on DB failure (spec: "catches and logs at debug
    // level on DB failure"):
    expect(debugSpy).toHaveBeenCalled()
  })

  it("is fire-and-forget: the caller's return path is unaffected", () => {
    mockWrite.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50))
    )

    // Callers `void track(...)` and immediately proceed — return value must
    // be undefined (nothing to await) and no await is required to get here.
    const result: unknown = track("booking_completed", {
      userId: "u1",
      bookingId: "b1",
      meta: { durationMs: 12, visitId: "v1" },
    })
    expect(result).toBeUndefined()

    // The synchronous work after track() runs to completion while the write
    // is still pending:
    let after = false
    expect(() => {
      after = true
    }).not.toThrow()
    expect(after).toBe(true)
  })

  it("resolves the caller synchronously even when the DB write hangs", async () => {
    let release: () => void
    mockWrite.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )

    // Track returns synchronously despite the unresolved write.
    track("slot_checked", { meta: { countChecked: 3 } })

    // And a subsequent synchronous caller is not blocked on it:
    track("conflict_found", { bookingId: "b2" })

    expect(mockWrite).toHaveBeenCalledTimes(2)
    release!()
    await new Promise((r) => setImmediate(r))
  })

  it("maps optional fields to null instead of undefined for persistence", async () => {
    mockWrite.mockResolvedValue(undefined)
    track("public_page_view", { meta: { slug: "sze/discovery" } })
    await new Promise((r) => setImmediate(r))

    expect(mockWrite).toHaveBeenCalledWith({
      type: "public_page_view",
      userId: null,
      bookingId: null,
      eventType: null,
      meta: { slug: "sze/discovery" },
      source: null,
    })
  })

  it("skips unknown event types without calling the writer", async () => {
    // @ts-expect-error — deliberately invalid event type
    track("not_a_real_event")
    await new Promise((r) => setImmediate(r))
    expect(mockWrite).not.toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalled()
  })

  it("passes all supplied fields straight through", async () => {
    mockWrite.mockResolvedValue(undefined)
    track("booking_completed", {
      userId: "u9",
      bookingId: "b9",
      eventType: "et9",
      source: "api",
      meta: { durationMs: 300, visitId: "vv" },
    })
    await new Promise((r) => setImmediate(r))

    expect(mockWrite).toHaveBeenCalledWith({
      type: "booking_completed",
      userId: "u9",
      bookingId: "b9",
      eventType: "et9",
      meta: { durationMs: 300, visitId: "vv" },
      source: "api",
    })
  })
})
