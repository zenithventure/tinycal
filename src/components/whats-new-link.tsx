"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { CHANGELOG_SEEN_KEY, hasUnseenChangelog, latestEntryDate } from "@/lib/changelog"
import { CHANGELOG_SEEN_EVENT } from "@/components/mark-changelog-seen"

export function WhatsNewLink() {
  const [unseen, setUnseen] = useState(false)

  useEffect(() => {
    const check = () => {
      try {
        setUnseen(hasUnseenChangelog(latestEntryDate(), localStorage.getItem(CHANGELOG_SEEN_KEY)))
      } catch {
        setUnseen(false)
      }
    }
    check()
    window.addEventListener(CHANGELOG_SEEN_EVENT, check)
    window.addEventListener("storage", check)
    return () => {
      window.removeEventListener(CHANGELOG_SEEN_EVENT, check)
      window.removeEventListener("storage", check)
    }
  }, [])

  return (
    <Link
      href="/changelog"
      className={cn(
        "relative flex items-center gap-1 text-sm",
        unseen
          ? "font-medium text-blue-600 underline underline-offset-4 dark:text-blue-400"
          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      )}
      aria-label={unseen ? "What's new (new updates)" : "What's new"}
    >
      <Sparkles className="w-4 h-4" />
      <span className="hidden sm:inline">What&apos;s new</span>
      {unseen && <span data-testid="whats-new-dot" className="absolute -top-1 -right-2 h-2 w-2 rounded-full bg-red-500" />}
    </Link>
  )
}
