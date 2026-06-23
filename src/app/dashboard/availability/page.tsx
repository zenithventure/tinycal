"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Save } from "lucide-react"
import Link from "next/link"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Rule {
  dayOfWeek: number
  startTime: string
  endTime: string
  enabled: boolean
}

interface ResolutionEventType {
  id: string
  title: string
  slug: string
  source: "EVENT_TYPE_SCHEDULE" | "USER_DEFAULT_SCHEDULE" | "LEGACY_AVAILABILITY" | "NONE"
  scheduleId: string | null
  scheduleName: string | null
}

interface ResolutionSummary {
  defaultSchedule: { id: string; name: string; ruleCount: number } | null
  legacyRuleCount: number
  eventTypes: ResolutionEventType[]
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [resolution, setResolution] = useState<ResolutionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/availability").then(r => r.json()).then((data) => {
      if (data.length === 0) {
        // Default: Mon-Fri 9-5
        setRules(DAYS.map((_, i) => ({
          dayOfWeek: i,
          startTime: "09:00",
          endTime: "17:00",
          enabled: i >= 1 && i <= 5,
        })))
      } else {
        // Group by day
        const byDay = DAYS.map((_, i) => {
          const existing = data.find((r: any) => r.dayOfWeek === i)
          return existing || { dayOfWeek: i, startTime: "09:00", endTime: "17:00", enabled: false }
        })
        setRules(byDay)
      }
    })
    fetch("/api/availability/resolution")
      .then(r => r.ok ? r.json() : null)
      .then(setResolution)
      .catch(() => setResolution(null))
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: rules.filter(r => r.enabled) }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const eventTypeCount = resolution?.eventTypes.length ?? 0
  const usingLegacy = (resolution?.eventTypes ?? []).filter(
    e => e.source === "LEGACY_AVAILABILITY"
  ).length
  const shadowedByDefault = (resolution?.eventTypes ?? []).filter(
    e => e.source === "USER_DEFAULT_SCHEDULE"
  ).length
  const shadowedByEventSchedule = (resolution?.eventTypes ?? []).filter(
    e => e.source === "EVENT_TYPE_SCHEDULE"
  ).length
  const shadowedCount = shadowedByDefault + shadowedByEventSchedule
  const legacyIsFullyShadowed = eventTypeCount > 0 && usingLegacy === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Availability</h1>
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {resolution && shadowedCount > 0 && (
        <div className={`mb-4 flex items-start gap-2 text-sm border rounded-lg px-4 py-3 ${
          legacyIsFullyShadowed
            ? "text-amber-800 bg-amber-50 border-amber-200"
            : "text-blue-800 bg-blue-50 border-blue-200"
        }`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            {legacyIsFullyShadowed ? (
              <>
                These legacy rules <strong>aren&apos;t being used</strong> right now —
                every event type resolves availability from a{" "}
                <Link href="/dashboard/schedules" className="underline">schedule</Link>{" "}
                instead{resolution.defaultSchedule ? <> (default: “{resolution.defaultSchedule.name}”)</> : null}.
                Editing these rows won&apos;t change your bookable slots.
              </>
            ) : (
              <>
                {shadowedCount} of {eventTypeCount} event types resolve availability from a{" "}
                <Link href="/dashboard/schedules" className="underline">schedule</Link>{" "}
                instead of these legacy rules. The remaining {usingLegacy} still use the rules below.
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {rules.map((rule, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <input type="checkbox" checked={rule.enabled}
              onChange={e => {
                const updated = [...rules]
                updated[i].enabled = e.target.checked
                setRules(updated)
              }}
              className="rounded" />
            <span className="w-28 text-sm font-medium">{DAYS[rule.dayOfWeek]}</span>
            {rule.enabled ? (
              <div className="flex items-center gap-2">
                <input type="time" value={rule.startTime}
                  onChange={e => {
                    const updated = [...rules]
                    updated[i].startTime = e.target.value
                    setRules(updated)
                  }}
                  className="border rounded px-2 py-1 text-sm" />
                <span className="text-gray-400">—</span>
                <input type="time" value={rule.endTime}
                  onChange={e => {
                    const updated = [...rules]
                    updated[i].endTime = e.target.value
                    setRules(updated)
                  }}
                  className="border rounded px-2 py-1 text-sm" />
              </div>
            ) : (
              <span className="text-sm text-gray-400">Unavailable</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
