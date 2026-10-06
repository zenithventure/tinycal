"use client"

import { useEffect } from "react"
import { CHANGELOG_SEEN_KEY } from "@/lib/changelog"

export const CHANGELOG_SEEN_EVENT = "tinycal:changelog-seen"

/** Renders nothing; records that this browser has viewed the changelog. */
export function MarkChangelogSeen() {
  useEffect(() => {
    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, new Date().toISOString())
      window.dispatchEvent(new Event(CHANGELOG_SEEN_EVENT))
    } catch {
      // localStorage unavailable (private mode etc.)
    }
  }, [])
  return null
}
