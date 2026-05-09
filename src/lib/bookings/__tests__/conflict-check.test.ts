import { describe, it, expect, vi, beforeEach } from "vitest"
import { hasBookingConflict } from "../conflict-check"

const mockBookingFindFirst = vi.fn()
const mockGetConflictingEvents = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    booking: {
      findFirst: (...args: any[]) => mockBookingFindFirst(...args),
    },
  },
}))

vi.mock("@/lib/calendar/conflict-detection", () => ({
  getConflictingEvents: (...args: any[]) => mockGetConflictingEvents(...args),
}))

const START = new Date("2026-06-01T10:00:00Z")
const END = new Date("2026-06-01T10:30:00Z")

const SOLO_EVENT_TYPE = {
  id: "et-1",
  userId: "user-owner",
  isCollective: false,
  collectiveMembers: [] as string[],
}

const COLLECTIVE_EVENT_TYPE = {
  id: "et-collective",
  userId: "user-sze",
  isCollective: true,
  collectiveMembers: ["user-alex"],
}

describe("hasBookingConflict", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBookingFindFirst.mockResolvedValue(null)
    mockGetConflictingEvents.mockResolvedValue([])
  })

  describe("non-collective", () => {
    it("returns false when owner has no DB or calendar conflicts", async () => {
      const result = await hasBookingConflict({
        eventType: SOLO_EVENT_TYPE,
        start: START,
        end: END,
      })

      expect(result).toBe(false)
      expect(mockBookingFindFirst).toHaveBeenCalledTimes(1)
      expect(mockBookingFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user-owner" }),
        })
      )
    })

    it("returns true when owner has a DB conflict", async () => {
      mockBookingFindFirst.mockResolvedValueOnce({ id: "existing-booking" })

      const result = await hasBookingConflict({
        eventType: SOLO_EVENT_TYPE,
        start: START,
        end: END,
      })

      expect(result).toBe(true)
    })

    it("returns true when owner's connected calendar is busy", async () => {
      mockGetConflictingEvents.mockResolvedValueOnce([
        { start: START, end: END, calendarId: "primary", provider: "GOOGLE" },
      ])

      const result = await hasBookingConflict({
        eventType: SOLO_EVENT_TYPE,
        start: START,
        end: END,
      })

      expect(result).toBe(true)
    })
  })

  describe("collective", () => {
    it("checks every host (owner + collective members)", async () => {
      await hasBookingConflict({
        eventType: COLLECTIVE_EVENT_TYPE,
        start: START,
        end: END,
      })

      const checkedUserIds = mockBookingFindFirst.mock.calls.map(
        (call: any[]) => call[0].where.userId
      )
      expect(checkedUserIds.sort()).toEqual(["user-alex", "user-sze"])

      const calendarUserIds = mockGetConflictingEvents.mock.calls.map(
        (call: any[]) => call[0]
      )
      expect(calendarUserIds.sort()).toEqual(["user-alex", "user-sze"])
    })

    it("returns true when a collective member has a DB conflict", async () => {
      mockBookingFindFirst.mockImplementation(({ where }: any) =>
        where.userId === "user-alex"
          ? Promise.resolve({ id: "alex-existing-booking" })
          : Promise.resolve(null)
      )

      const result = await hasBookingConflict({
        eventType: COLLECTIVE_EVENT_TYPE,
        start: START,
        end: END,
      })

      expect(result).toBe(true)
    })

    it("returns true when a collective member's calendar is busy", async () => {
      mockGetConflictingEvents.mockImplementation((userId: string) =>
        userId === "user-alex"
          ? Promise.resolve([
              { start: START, end: END, calendarId: "primary", provider: "GOOGLE" },
            ])
          : Promise.resolve([])
      )

      const result = await hasBookingConflict({
        eventType: COLLECTIVE_EVENT_TYPE,
        start: START,
        end: END,
      })

      expect(result).toBe(true)
    })

    it("dedupes the owner if also listed in collectiveMembers", async () => {
      await hasBookingConflict({
        eventType: {
          ...COLLECTIVE_EVENT_TYPE,
          collectiveMembers: ["user-sze", "user-alex"],
        },
        start: START,
        end: END,
      })

      // Owner should only be queried once even though listed twice
      const checkedUserIds = mockBookingFindFirst.mock.calls.map(
        (call: any[]) => call[0].where.userId
      )
      const szeCount = checkedUserIds.filter((u: string) => u === "user-sze").length
      expect(szeCount).toBe(1)
    })
  })

  describe("excludeBookingId", () => {
    it("excludes the specified booking id from the DB conflict query", async () => {
      await hasBookingConflict({
        eventType: SOLO_EVENT_TYPE,
        start: START,
        end: END,
        excludeBookingId: "this-booking",
      })

      expect(mockBookingFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: "this-booking" } }),
        })
      )
    })

    it("does not add an id filter when excludeBookingId is omitted", async () => {
      await hasBookingConflict({
        eventType: SOLO_EVENT_TYPE,
        start: START,
        end: END,
      })

      const where = mockBookingFindFirst.mock.calls[0][0].where
      expect(where).not.toHaveProperty("id")
    })
  })
})
