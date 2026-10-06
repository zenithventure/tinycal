import { cn } from "@/lib/utils"
import type { ChangelogType } from "@/lib/changelog"

const STYLES: Record<ChangelogType, string> = {
  new: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  fixed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  breaking: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
}

const LABELS: Record<ChangelogType, string> = {
  new: "New",
  fixed: "Fixed",
  changed: "Changed",
  breaking: "Breaking",
}

export function ChangelogBadge({ type }: { type: ChangelogType }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", STYLES[type])}>
      {LABELS[type]}
    </span>
  )
}
