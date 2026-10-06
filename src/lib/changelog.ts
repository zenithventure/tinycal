import raw from "../../data/changelog.json"

export type ChangelogType = "new" | "fixed" | "changed" | "breaking"

export interface ChangelogChange {
  type: ChangelogType
  text: string
}

export interface ChangelogEntry {
  id: string
  date: string // YYYY-MM-DD
  title: string
  description: string
  type: ChangelogType
  tags?: string[]
  changes?: ChangelogChange[]
}

export const CHANGELOG_SEEN_KEY = "tinycal_changelog_seen"

export const changelogEntries: ChangelogEntry[] = (raw.entries as ChangelogEntry[])
  .slice()
  .sort((a, b) => b.date.localeCompare(a.date))

/** Group entries (already sorted newest-first) by date, preserving order. */
export function groupByDate(entries: ChangelogEntry[]): { date: string; entries: ChangelogEntry[] }[] {
  const groups: { date: string; entries: ChangelogEntry[] }[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last.date === entry.date) last.entries.push(entry)
    else groups.push({ date: entry.date, entries: [entry] })
  }
  return groups
}

export function latestEntryDate(entries: ChangelogEntry[] = changelogEntries): string | null {
  return entries.reduce<string | null>((max, e) => (max === null || e.date > max ? e.date : max), null)
}

/**
 * True when the newest entry is newer than the stored "seen" timestamp.
 * A missing or unparseable timestamp counts as never seen.
 */
export function hasUnseenChangelog(latestDate: string | null, seen: string | null): boolean {
  if (!latestDate) return false
  const latest = Date.parse(latestDate)
  if (Number.isNaN(latest)) return false
  if (!seen) return true
  const seenMs = Date.parse(seen)
  if (Number.isNaN(seenMs)) return true
  return latest > seenMs
}
