"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save } from "lucide-react"
import Link from "next/link"

interface ScheduleOption {
  id: string
  name: string
  isDefault: boolean
}

export default function EditEventTypePage() {
  const params = useParams()
  const router = useRouter()
  const [et, setEt] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [schedules, setSchedules] = useState<ScheduleOption[]>([])

  useEffect(() => {
    fetch(`/api/event-types/${params.id}`).then(r => r.json()).then(setEt)
    fetch("/api/availability/schedules").then(r => r.json()).then(setSchedules)
  }, [params.id])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/event-types/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(et),
    })
    setSaving(false)
    router.push("/dashboard/event-types")
  }

  if (!et) return <div className="animate-pulse">Loading...</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/event-types" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold">Edit Event Type</h1>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input type="text" value={et.title} onChange={e => setEt({ ...et, title: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (min)</label>
            <select value={et.duration} onChange={e => setEt({ ...et, duration: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2">
              {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <select value={et.location} onChange={e => setEt({ ...et, location: e.target.value })}
              className="w-full border rounded-lg px-3 py-2">
              <option value="GOOGLE_MEET">Google Meet</option>
              <option value="ZOOM">Zoom</option>
              <option value="PHONE">Phone</option>
              <option value="IN_PERSON">In Person</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <input type="color" value={et.color} onChange={e => setEt({ ...et, color: e.target.value })}
              className="w-full h-10 border rounded-lg cursor-pointer" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={et.description || ""} onChange={e => setEt({ ...et, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 h-20 resize-none" />
        </div>

        <hr />
        <h3 className="font-semibold">Scheduling Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Buffer before (min)</label>
            <input type="number" value={et.bufferBefore} onChange={e => setEt({ ...et, bufferBefore: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2" min={0} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Buffer after (min)</label>
            <input type="number" value={et.bufferAfter} onChange={e => setEt({ ...et, bufferAfter: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2" min={0} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min notice (min)</label>
            <input type="number" value={et.minNotice} onChange={e => setEt({ ...et, minNotice: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2" min={0} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Daily limit</label>
            <input type="number" value={et.dailyLimit || ""} onChange={e => setEt({ ...et, dailyLimit: e.target.value ? Number(e.target.value) : null })}
              className="w-full border rounded-lg px-3 py-2" min={0} placeholder="No limit" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Weekly limit</label>
            <input type="number" value={et.weeklyLimit || ""} onChange={e => setEt({ ...et, weeklyLimit: e.target.value ? Number(e.target.value) : null })}
              className="w-full border rounded-lg px-3 py-2" min={0} placeholder="No limit" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max future (days)</label>
            <input type="number" value={et.maxFutureDays} onChange={e => setEt({ ...et, maxFutureDays: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2" min={1} />
          </div>
        </div>

        <hr />
        <h3 className="font-semibold">Availability Schedule</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Which schedule controls this event&apos;s availability?</label>
          <select
            value={et.availabilityScheduleId || ""}
            onChange={e => setEt({ ...et, availabilityScheduleId: e.target.value || null })}
            className="w-full border rounded-lg px-3 py-2 max-w-sm"
          >
            <option value="">Default schedule</option>
            {schedules.map((s: ScheduleOption) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Manage schedules on the{" "}
            <Link href="/dashboard/availability" className="text-blue-600 hover:underline">
              Availability
            </Link>{" "}
            page.
          </p>
        </div>

        <hr />
        <h3 className="font-semibold">Payment</h3>
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={et.requirePayment} onChange={e => setEt({ ...et, requirePayment: e.target.checked })}
            className="rounded" id="requirePayment" />
          <label htmlFor="requirePayment" className="text-sm">Require payment before booking</label>
        </div>
        {et.requirePayment && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price</label>
              <input type="number" step="0.01" value={et.price || ""} onChange={e => setEt({ ...et, price: Number(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Currency</label>
              <select value={et.currency} onChange={e => setEt({ ...et, currency: e.target.value })}
                className="w-full border rounded-lg px-3 py-2">
                <option value="usd">USD</option>
                <option value="eur">EUR</option>
                <option value="gbp">GBP</option>
              </select>
            </div>
          </div>
        )}

        <hr />
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={et.isCollective} onChange={e => setEt({ ...et, isCollective: e.target.checked })}
            className="rounded" id="isCollective" />
          <label htmlFor="isCollective" className="text-sm">Collective scheduling (find time for multiple hosts)</label>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" checked={et.active} onChange={e => setEt({ ...et, active: e.target.checked })}
            className="rounded" id="active" />
          <label htmlFor="active" className="text-sm">Active (visible on booking page)</label>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
