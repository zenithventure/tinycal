import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── #116 regression: Google Calendar 401-retry used to return ONLY page 1 ──
//
// fetchGoogleCalendarEvents' 401-retry path used to fetch a single page and
// return it, so a conflict on page 2+ was silently missed on busy calendars
// (250+ events in the window). The fix routes both paths through the same
// bounded paginator (hard cap GOOGLE_FETCH_EVENT_CAP = 5000).
//
// We mock the googleapis SDK boundary: the first `events.list` throws a 401,
// the OAuth2 refresh is stubbed (no network), then a two-page calendar
// (250 + 250 events) is served. The target event lives on PAGE TWO.

function busyEvent(startIso: string, i: number) {
  return {
    id: `evt-${i}`,
    status: "confirmed",
    start: { dateTime: startIso },
    end: { dateTime: "2026-02-01T10:30:00.000Z" },
    summary: `event-${i}`,
  }
}

const PAGE_SIZE = 250

/** Build N busy event items spread over a week's worth of slots (Feb 1, 2026). */
function buildItems(n: number, startIndex: number) {
  return Array.from({ length: n }, (_, k) => {
    const i = startIndex + k
    const date = new Date(Date.UTC(2026, 1, 1, 0, 0, 0) + i * 7 * 60_000)
    return busyEvent(date.toISOString(), i)
  })
}

type InstallOptions = {
  list: (opts: any) => Promise<any>
  refreshAccessToken?: () => Promise<any>
  refreshError?: unknown
}

/**
 * Install a fresh googleapis mock for the NEXT dynamic import of ../google.
 * `vi.resetModules()` is called by the caller before importing.
 */
function installSdk({
  list,
  refreshAccessToken = () =>
    Promise.resolve({
      access_token: "new-access",
      refresh_token: "rt",
      expiry_date: Date.now() + 3_600_000,
    }),
  refreshError,
}: InstallOptions) {
  vi.doMock("googleapis", () => ({
    google: {
      calendar: () => ({ events: { list } }),
      auth: {
        OAuth2: class {
          setCredentials() {}
          on() {}
          async refreshAccessToken() {
            if (refreshError) throw refreshError
            return { credentials: await refreshAccessToken() }
          }
        },
      },
    },
  }))
}

async function loadGoogle() {
  vi.resetModules()
  const mod: any = await import("../google")
  return mod
}

describe("fetchGoogleCalendarEvents pagination + 401-retry (#116)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("detects a page-2 event after a 401 → token refresh (regression)", async () => {
    // 500 events total: page 1 = 250, page 2 = 250. The LAST event (page 2)
    // is the conflict the host must not miss. Pre-fix, the 401-retry path
    // returned only page 1 (250 events) — this test pins the fix.
    const page1 = buildItems(PAGE_SIZE, 0)
    const page2 = buildItems(PAGE_SIZE, PAGE_SIZE)
    const pageTwoTail = page2[page2.length - 1]

    let call = 0
    const list = vi.fn(async (opts: any) => {
      call++
      if (call === 1) {
        const err: any = new Error("Request failed with status code 401")
        err.code = 401
        throw err
      }
      if (opts.pageToken === undefined) {
        return { data: { items: page1, nextPageToken: "token-page-2" } }
      }
      if (opts.pageToken === "token-page-2") {
        return { data: { items: page2, nextPageToken: null } }
      }
      throw new Error(`unexpected pageToken: ${opts.pageToken}`)
    })

    installSdk({ list })
    const { fetchGoogleCalendarEvents } = await loadGoogle()

    const events = await fetchGoogleCalendarEvents(
      "expired-access-token",
      "refresh-token",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-03-01T00:00:00Z")
    )

    // BOTH pages fetched (pre-fix this was exactly PAGE_SIZE):
    expect(events.length).toBe(2 * PAGE_SIZE)

    // Regression assertion: the page-2 event is present in the results.
    const found = events.find(
      (ev: any) =>
        ev.summary === pageTwoTail.summary &&
        ev.start.getTime() === new Date(pageTwoTail.start.dateTime).getTime()
    )
    expect(found).toBeDefined()

    // The paginator followed nextPageToken into page 2:
    expect(list.mock.calls.map((c: any[]) => c[0].pageToken)).toContain("token-page-2")
  })

  it("stops at GOOGLE_FETCH_EVENT_CAP — a never-ending nextPageToken cannot loop forever", async () => {
    // Pathological calendar: every page is also 250 events and every page has
    // a nextPageToken. Without the cap this would loop indefinitely.
    const items = buildItems(PAGE_SIZE, 0)
    const list = vi.fn(async () => ({
      data: { items, nextPageToken: "another-page" },
    }))

    installSdk({ list })
    const { fetchGoogleCalendarEvents, GOOGLE_FETCH_EVENT_CAP } = await loadGoogle()
    expect(GOOGLE_FETCH_EVENT_CAP).toBe(5000)

    const events = await fetchGoogleCalendarEvents(
      "at",
      null,
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-03-01T00:00:00Z")
    )

    // Exactly the cap (20 × 250), not unbounded:
    expect(events.length).toBe(5000)
    expect(list).toHaveBeenCalledTimes(20)
  })

  it("returns a single page unchanged when there is no nextPageToken", async () => {
    const items = buildItems(10, 0)
    const list = vi.fn(async () => ({ data: { items, nextPageToken: null } }))

    installSdk({ list })
    const { fetchGoogleCalendarEvents } = await loadGoogle()

    const events = await fetchGoogleCalendarEvents("at", null, new Date("2026-02-01"), new Date("2026-02-02"))
    expect(events).toHaveLength(10)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it("returns [] (not a throw) when the 401 refresh also fails", async () => {
    const list = vi.fn(async () => {
      const err: any = new Error("401 Unauthorized")
      err.code = 401
      throw err
    })

    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    installSdk({ list, refreshError: new Error("invalid_grant") })
    const { fetchGoogleCalendarEvents } = await loadGoogle()

    const events = await fetchGoogleCalendarEvents(
      "expired",
      "rt",
      new Date("2026-02-01"),
      new Date("2026-02-02")
    )
    expect(events).toEqual([])
    spy.mockRestore()
    warn.mockRestore()
  })
})
