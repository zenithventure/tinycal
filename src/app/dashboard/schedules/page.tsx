"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Star, X } from "lucide-react"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Rule {
  id?: string
  dayOfWeek?: number
  date?: string
  startTime: string
  endTime: string
  enabled: boolean
}

interface Schedule {
  id: string
  name: string
  isDefault: boolean
  rules: Rule[]
}

function defaultRule(): Rule {
  return { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", enabled: true }
}

function RulesEditor({
  rules,
  onChange,
}: {
  rules: Rule[]
  onChange: (rules: Rule[]) => void
}) {
  function update(idx: number, patch: Partial<Rule>) {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function remove(idx: number) {
    onChange(rules.filter((_, i) => i !== idx))
  }
  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-sm text-gray-500">No rules yet. Add one below.</p>
      )}
      {rules.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <select
            value={r.dayOfWeek ?? 1}
            onChange={e => update(i, { dayOfWeek: Number(e.target.value), date: undefined })}
            className="border rounded px-2 py-1.5 bg-white"
          >
            {DAYS.map((d, idx) => (
              <option key={idx} value={idx}>{d}</option>
            ))}
          </select>
          <input
            type="time"
            value={r.startTime}
            onChange={e => update(i, { startTime: e.target.value })}
            className="border rounded px-2 py-1.5"
          />
          <span className="text-gray-500">—</span>
          <input
            type="time"
            value={r.endTime}
            onChange={e => update(i, { endTime: e.target.value })}
            className="border rounded px-2 py-1.5"
          />
          <button
            onClick={() => remove(i)}
            className="text-gray-400 hover:text-red-600 p-1"
            aria-label="Remove rule"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rules, defaultRule()])}
        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
      >
        <Plus className="w-4 h-4" /> Add rule
      </button>
    </div>
  )
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newSchedule, setNewSchedule] = useState<{ name: string; rules: Rule[] }>({
    name: "",
    rules: [defaultRule()],
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftRules, setDraftRules] = useState<Rule[]>([])
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSchedules()
  }, [])

  async function fetchSchedules() {
    setLoading(true)
    const res = await fetch("/api/availability/schedules")
    const data = await res.json()
    setSchedules(data || [])
    setLoading(false)
  }

  async function handleCreateSchedule() {
    if (!newSchedule.name.trim()) {
      setCreateError("Name is required")
      return
    }
    setCreateError(null)
    setSaving(true)
    const res = await fetch("/api/availability/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSchedule.name,
        rules: newSchedule.rules,
      }),
    })
    setSaving(false)
    if (res.ok) {
      await fetchSchedules()
      setCreating(false)
      setNewSchedule({ name: "", rules: [defaultRule()] })
    } else {
      const err = await res.json().catch(() => ({}))
      setCreateError(err.error || "Failed to create schedule")
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!confirm("Delete this schedule?")) return
    const res = await fetch(`/api/availability/schedules/${id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      await fetchSchedules()
    } else {
      const error = await res.json()
      alert(error.error || "Failed to delete")
    }
  }

  async function handleSetDefault(id: string) {
    const res = await fetch(`/api/availability/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    })
    if (res.ok) await fetchSchedules()
  }

  function beginEdit(schedule: Schedule) {
    setEditingId(schedule.id)
    setDraftRules(schedule.rules.map(r => ({
      dayOfWeek: r.dayOfWeek,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      enabled: r.enabled,
    })))
    setEditError(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    setEditError(null)
    const res = await fetch(`/api/availability/schedules/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: draftRules }),
    })
    setSaving(false)
    if (res.ok) {
      setEditingId(null)
      await fetchSchedules()
    } else {
      const err = await res.json().catch(() => ({}))
      setEditError(err.error || "Failed to save rules")
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading schedules...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Availability Schedules</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {creating && (
        <div className="bg-white border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create New Schedule</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Schedule name"
              value={newSchedule.name}
              onChange={e => setNewSchedule({ ...newSchedule, name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <div>
              <div className="text-sm font-medium mb-2">Rules</div>
              <RulesEditor
                rules={newSchedule.rules}
                onChange={rules => setNewSchedule({ ...newSchedule, rules })}
              />
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateSchedule}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => {
                  setCreating(false)
                  setNewSchedule({ name: "", rules: [defaultRule()] })
                  setCreateError(null)
                }}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {schedules.length === 0 ? (
          <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
            No schedules yet. Create one to get started.
          </div>
        ) : (
          schedules.map(schedule => (
            <div key={schedule.id} className="bg-white border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{schedule.name}</h3>
                  {schedule.isDefault && (
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                      <Star className="w-3 h-3" /> Default
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {editingId !== schedule.id && (
                    <button
                      onClick={() => beginEdit(schedule)}
                      className="text-gray-600 hover:text-blue-600 text-sm px-3 py-1 border border-gray-200 rounded hover:border-blue-600"
                    >
                      Edit Rules
                    </button>
                  )}
                  {!schedule.isDefault && (
                    <button
                      onClick={() => handleSetDefault(schedule.id)}
                      className="text-gray-600 hover:text-blue-600 text-sm px-3 py-1 border border-gray-200 rounded hover:border-blue-600"
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className="text-red-600 hover:text-red-700 p-2"
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {editingId === schedule.id ? (
                <div className="space-y-3">
                  <RulesEditor rules={draftRules} onChange={setDraftRules} />
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditError(null) }}
                      className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : schedule.rules.length === 0 ? (
                <p className="text-gray-400 text-sm">No rules configured</p>
              ) : (
                <div className="bg-gray-50 rounded border divide-y text-sm">
                  {schedule.rules.map((rule, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <span className="font-medium">
                        {rule.dayOfWeek !== undefined && rule.dayOfWeek !== null
                          ? DAYS[rule.dayOfWeek]
                          : "Custom Date"}
                      </span>
                      <span className="text-gray-600">
                        {rule.startTime} — {rule.endTime}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <strong>Tip:</strong> Link a schedule to an event type in the event-type editor.
        While a schedule is linked, it replaces the legacy availability for that event type.
      </div>
    </div>
  )
}
