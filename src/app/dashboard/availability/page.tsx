"use client"

import { useEffect, useState } from "react"
import { Save, Plus, Trash2, Star } from "lucide-react"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Rule {
  dayOfWeek: number
  startTime: string
  endTime: string
  enabled: boolean
}

interface Schedule {
  id: string
  name: string
  isDefault: boolean
  rules: Rule[]
  _count?: { eventTypes: number }
}

function buildRuleSet(rules: Rule[]): Rule[] {
  return DAYS.map((_, i) => {
    const existing = rules.find((r) => r.dayOfWeek === i)
    return existing ?? { dayOfWeek: i, startTime: "09:00", endTime: "17:00", enabled: false }
  })
}

export default function AvailabilityPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)

  async function loadSchedules() {
    const data = await fetch("/api/availability/schedules").then((r) => r.json())
    setSchedules(data)
    return data as Schedule[]
  }

  useEffect(() => {
    loadSchedules().then((data) => {
      if (data.length > 0) {
        const def = data.find((s: Schedule) => s.isDefault) || data[0]
        setActiveId(def.id)
        setRules(buildRuleSet(def.rules))
      }
      setLoading(false)
    })
  }, [])

  function selectSchedule(id: string) {
    setActiveId(id)
    const s = schedules.find((s) => s.id === id)
    if (s) setRules(buildRuleSet(s.rules))
    setSaved(false)
  }

  const activeSchedule = schedules.find((s) => s.id === activeId)

  async function handleSave() {
    if (!activeId || !activeSchedule) return
    setSaving(true)
    await fetch(`/api/availability/schedules/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activeSchedule.name,
        isDefault: activeSchedule.isDefault,
        rules: rules.filter((r) => r.enabled),
      }),
    })
    await loadSchedules()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const defaultRules = DAYS.map((_, i) => ({
      dayOfWeek: i,
      startTime: "09:00",
      endTime: "17:00",
      enabled: i >= 1 && i <= 5,
    }))
    const schedule = await fetch("/api/availability/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), rules: defaultRules.filter((r) => r.enabled) }),
    }).then((r) => r.json())
    setNewName("")
    setCreating(false)
    const data = await loadSchedules()
    selectSchedule(schedule.id)
  }

  async function handleDelete() {
    if (!activeSchedule) return
    if (activeSchedule._count && activeSchedule._count.eventTypes > 0) {
      alert(`Cannot delete: ${activeSchedule._count.eventTypes} event type(s) use this schedule.`)
      return
    }
    if (!confirm(`Delete "${activeSchedule.name}"?`)) return
    await fetch(`/api/availability/schedules/${activeSchedule.id}`, { method: "DELETE" })
    const data = await loadSchedules()
    if (data.length > 0) {
      selectSchedule(data[0].id)
    } else {
      setActiveId(null)
      setRules([])
    }
  }

  async function handleSetDefault() {
    if (!activeId || !activeSchedule) return
    await fetch(`/api/availability/schedules/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activeSchedule.name,
        isDefault: true,
        rules: rules.filter((r) => r.enabled),
      }),
    })
    await loadSchedules()
  }

  if (loading) return <div className="animate-pulse text-gray-400">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Availability</h1>
        {activeSchedule && (
          <div className="flex items-center gap-2">
            {!activeSchedule.isDefault && (
              <button onClick={handleSetDefault}
                className="text-sm text-gray-500 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-gray-100 flex items-center gap-1">
                <Star className="w-3.5 h-3.5" /> Set as default
              </button>
            )}
            <button onClick={handleDelete}
              className="text-sm text-gray-400 hover:text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
              <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Schedule tabs + create */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {schedules.map((s) => (
          <button key={s.id} onClick={() => selectSchedule(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              s.id === activeId
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            }`}>
            {s.name} {s.isDefault && "(default)"}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <input type="text" placeholder="New schedule..." value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="border rounded-lg px-2 py-1.5 text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none" />
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rules editor */}
      {activeSchedule ? (
        <div className="bg-white border rounded-xl divide-y">
          {rules.map((rule, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <input type="checkbox" checked={rule.enabled}
                onChange={(e) => {
                  const updated = [...rules]
                  updated[i] = { ...updated[i], enabled: e.target.checked }
                  setRules(updated)
                }}
                className="rounded" />
              <span className="w-28 text-sm font-medium">{DAYS[rule.dayOfWeek]}</span>
              {rule.enabled ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={rule.startTime}
                    onChange={(e) => {
                      const updated = [...rules]
                      updated[i] = { ...updated[i], startTime: e.target.value }
                      setRules(updated)
                    }}
                    className="border rounded px-2 py-1 text-sm" />
                  <span className="text-gray-400">&mdash;</span>
                  <input type="time" value={rule.endTime}
                    onChange={(e) => {
                      const updated = [...rules]
                      updated[i] = { ...updated[i], endTime: e.target.value }
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
      ) : (
        <div className="text-center py-12 text-gray-400">
          Create a schedule to get started.
        </div>
      )}
    </div>
  )
}
