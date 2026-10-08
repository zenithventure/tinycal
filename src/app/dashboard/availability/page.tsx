"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Save } from "lucide-react"
import { activeScheduleLabel } from "@/lib/availability-rules"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Rule {
  dayOfWeek: number
  startTime: string
  endTime: string
  enabled: boolean
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[]>([])
  // Rules this page can't edit (date-specific rules, extra windows on a day).
  // PUT replaces the whole rule set, so they're sent back untouched on save.
  const [preserved, setPreserved] = useState<any[]>([])
  const [scheduleLabel, setScheduleLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/availability/schedules").then(r => r.json()).then((schedules) => {
      const def = Array.isArray(schedules) ? schedules.find((s: any) => s.isDefault) : null
      setScheduleLabel(activeScheduleLabel(def))
    }).catch(() => {})
    fetch("/api/availability").then(r => r.json()).then((data) => {
      const seenDays = new Set<number>()
      setPreserved(data.filter((r: any) => {
        if (r.date) return true
        if (seenDays.has(r.dayOfWeek)) return true
        seenDays.add(r.dayOfWeek)
        return false
      }).map((r: any) => ({ ...r, date: r.date ? r.date.slice(0, 10) : undefined })))
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
          const existing = data.find((r: any) => r.dayOfWeek === i && !r.date)
          return existing || { dayOfWeek: i, startTime: "09:00", endTime: "17:00", enabled: false }
        })
        setRules(byDay)
      }
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [
          ...rules.filter(r => r.enabled),
          ...preserved.map(({ id: _id, availabilityScheduleId: _sid, ...r }) => r),
        ],
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Availability</h1>
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {scheduleLabel && (
        <p className="text-sm text-gray-600 mb-4" data-testid="active-schedule">
          Editing schedule: <strong>{scheduleLabel}</strong>.{" "}
          <Link href="/dashboard/schedules" className="text-blue-600 hover:text-blue-700">
            Manage schedules and date-specific hours
          </Link>
        </p>
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
