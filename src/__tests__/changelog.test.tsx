import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ChangelogList } from "@/components/changelog-list"
import {
  changelogEntries,
  groupByDate,
  hasUnseenChangelog,
  latestEntryDate,
} from "@/lib/changelog"

describe("changelog data", () => {
  it("seeds the 1.0 Hardening release", () => {
    const entry = changelogEntries.find((e) => e.title === "1.0 Hardening")
    expect(entry?.date).toBe("2026-10-06")
    expect(entry?.changes?.map((c) => c.type)).toEqual(["new", "fixed", "breaking", "fixed"])
    const newest = [...changelogEntries].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    expect(latestEntryDate()).toBe(newest.date)
  })

  it("has unique ids and valid dates", () => {
    const ids = changelogEntries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of changelogEntries) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("renders seeded entries with type badges grouped by date", () => {
    const html = renderToStaticMarkup(createElement(ChangelogList, { entries: changelogEntries }))
    expect(html).toContain("1.0 Hardening")
    expect(html).toContain("October 6, 2026")
    expect(html).toContain("tc_live_")
    expect(html).toContain("Breaking")
    expect(html).toContain("Fixed")
    expect(html).toContain("New")
  })

  it("groups same-date entries together", () => {
    const base = { description: "", type: "new" as const }
    const groups = groupByDate([
      { ...base, id: "a", date: "2026-02-01", title: "A" },
      { ...base, id: "b", date: "2026-02-01", title: "B" },
      { ...base, id: "c", date: "2026-01-01", title: "C" },
    ])
    expect(groups.map((g) => [g.date, g.entries.length])).toEqual([
      ["2026-02-01", 2],
      ["2026-01-01", 1],
    ])
  })
})

describe("hasUnseenChangelog", () => {
  it("is false when there are no entries", () => {
    expect(hasUnseenChangelog(null, null)).toBe(false)
  })
  it("is true when never seen or seen value is invalid", () => {
    expect(hasUnseenChangelog("2026-10-06", null)).toBe(true)
    expect(hasUnseenChangelog("2026-10-06", "garbage")).toBe(true)
  })
  it("is true when seen is older than newest entry", () => {
    expect(hasUnseenChangelog("2026-10-06", "2026-10-05T23:59:59.000Z")).toBe(true)
  })
  it("is false when seen is at or after newest entry", () => {
    expect(hasUnseenChangelog("2026-10-06", "2026-10-06T00:00:00.000Z")).toBe(false)
    expect(hasUnseenChangelog("2026-10-06", "2026-11-01T12:00:00.000Z")).toBe(false)
  })
})
