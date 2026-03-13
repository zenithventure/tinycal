"use client"

import { useEffect, useState } from "react"
import { Save, Plus, Trash2, ChevronDown, ChevronUp, Star } from "lucide-react"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Rule {
  id?: string
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

const DEFAULT_RULES: Rule[] = DAYS.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "17:00",
  enabled: i >= 1 && i <= 5,
}))

function buildRuleSet(rules: Rule[]): Rule[] {
  return DAYS.map((_, i) => {
    const existing = rules.find((r) => r.dayOfWeek === i)
    return existing ?? { dayOfWeek: i, startTime: "09:00", endTime: "17:00", enabled: false }
  })
}

export default function AvailabilityPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)

  async function loadSchedules() {
    const data = await fetch("/api/availability/schedules").then((r) => r.json())
    setSchedules(data)
    if (data.length > 0 && !openId) setOpenId(data[0].id)
    setLoading(false)
  }

  useEffect(() => {
    loadSchedules()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateRule(scheduleId: string, dayIndex: number, field: keyof Rule, value: any) {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.id !== scheduleId) return s
        const ruleSet = buildRuleSet(s.rules)
        ruleSet[dayIndex] = { ...ruleSet[dayIndex], [field]: value }
        return { ...s, rules: ruleSet }
      })
    )
  }

  async function handleSave(schedule: Schedule) {
    setSaving(schedule.id)
    const rulesToSave = buildRuleSet(schedule.rules).filter((r) => r.enabled)
    await fetch(`/api/availability/schedules/${schedule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: schedule.name, isDefault: schedule.isDefault, rules: rulesToSave }),
    })
    setSaving(null)
    setSaved(schedule.id)
    setTimeout(() => setSaved(null), 2000)
    loadSchedules()
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const schedule = await fetch("/api/availability/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), rules: DEFAULT_RULES.filter((r) => r.enabled) }),
    }).then((r) => r.json())
    setNewName("")
    setCreating(false)
    await loadSchedules()
    setOpenId(schedule.id)
  }

  async function handleDelete(schedule: Schedule) {
    if (schedule._count && schedule._count.eventTypes > 0) {
      alert(`Cannot delete: ${schedule._count.eventTypes} event type(s) use this schedule.`)
      return
    }
    if (!confirm(`Delete schedule "${schedule.name}"? This cannot be undone.`)) return
    await fetch(`/api/availability/schedules/${schedule.id}`, { method: "DELETE" })
    await loadSchedules()
  }

  async function handleSetDefault(schedule: Schedule) {
    await fetch(`/api/availability/schedules/${schedule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: schedule.name, isDefault: true, rules: buildRuleSet(schedule.rules).filter((r) => r.enabled) }),
    })
    await loadSchedules()
  }

  if (loading) return <div className="animate-pulse text-gray-400">Loading availability…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create multiple schedules and link them to specific event types.
          </p>
        </div>
      </div>

      {/* Create new schedule */}
      <div className="bg-white border rounded-xl p-4 mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="New schedule name (e.g. Weekends)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> {creating ? "Creating…" : "Add Schedule"}
        </button>
      </div>

      {schedules.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No schedules yet. Create one above.
        </div>
      )}

      {/* Schedule list */}
      <div className="space-y-3">
        {schedules.map((schedule) => {
          const isOpen = openId === schedule.id
          const ruleSet = buildRuleSet(schedule.rules)

          return (
            <div key={schedule.id} className="bg-white border rounded-xl overflow-hidden">
              {/* Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() => setOpenId(isOpen ? null : schedule.id)}
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  <input
                    type="text"
                    value={schedule.name}
                    onChange={(e) => {
                      e.stopPropagation()
                      setSchedules((prev) =>
                        prev.map((s) => (s.id === schedule.id ? { ...s, name: e.target.value } : s))
                      )
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none bg-transparent px-1"
                  />
                  {schedule.isDefault && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" /> Default
                    </span>
                  )}
                  {schedule._count && schedule._count.eventTypes > 0 && (
                    <span className="text-xs text-gray-400">
                      {schedule._count.eventTypes} event type{schedule._count.eventTypes !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {!schedule.isDefault && (
                    <button
                      onClick={() => handleSetDefault(schedule)}
                      title="Set as default"
                      className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => handleSave(schedule)}
                    disabled={saving === schedule.id}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 text-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving === schedule.id ? "Saving…" : saved === schedule.id ? "Saved ✓" : "Save"}
                  </button>
                  <button
                    onClick={() => handleDelete(schedule)}
                    title="Delete schedule"
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rules */}
              {isOpen && (
                <div className="border-t divide-y">
                  {ruleSet.map((rule, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateRule(schedule.id, i, "enabled", e.target.checked)}
                        className="rounded"
                      />
                      <span className="w-28 text-sm font-medium">{DAYS[rule.dayOfWeek]}</span>
                      {rule.enabled ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={rule.startTime}
                            onChange={(e) => updateRule(schedule.id, i, "startTime", e.target.value)}
                            className="border rounded px-2 py-1 text-sm"
                          />
                          <span className="text-gray-400">—</span>
                          <input
                            type="time"
                            value={rule.endTime}
                            onChange={(e) => updateRule(schedule.id, i, "endTime", e.target.value)}
                            className="border rounded px-2 py-1 text-sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Unavailable</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
