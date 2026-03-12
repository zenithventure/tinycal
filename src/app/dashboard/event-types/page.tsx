"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { Plus, Copy, ExternalLink, Trash2, Calendar, Search, X } from "lucide-react"
import { formatDuration } from "@/lib/utils"

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function EventTypesPage() {
  const [eventTypes, setEventTypes] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: "", duration: 30, description: "", location: "GOOGLE_MEET" })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/event-types").then(r => r.json()).then(setEventTypes)
    fetch("/api/user").then(r => r.json()).then(setUser)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const et = await res.json()
        setEventTypes([et, ...eventTypes])
        setShowCreate(false)
        setForm({ title: "", duration: 30, description: "", location: "GOOGLE_MEET" })
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || "Failed to create event type. Please try again.")
      }
    } catch {
      alert("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event type?")) return
    await fetch(`/api/event-types/${id}`, { method: "DELETE" })
    setEventTypes(eventTypes.filter(e => e.id !== id))
  }

  function copyLink(slug: string, userSlug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/${userSlug}/${slug}`)
  }

  const filteredEventTypes = eventTypes.filter(et => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      et.title?.toLowerCase().includes(q) ||
      et.description?.toLowerCase().includes(q) ||
      et.location?.toLowerCase().replace("_", " ").includes(q)
    )
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Event Types</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> New Event Type
        </button>
      </div>

      {/* Search */}
      {eventTypes.length > 0 && (
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search event types..."
            className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); searchRef.current?.focus() }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100 transition"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Create Event Type</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" required
                  placeholder="e.g. 30 Minute Meeting" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2">
                  {[15, 30, 45, 60, 90, 120].map(d => (
                    <option key={d} value={d}>{formatDuration(d)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="GOOGLE_MEET">Google Meet</option>
                  <option value="ZOOM">Zoom</option>
                  <option value="PHONE">Phone Call</option>
                  <option value="IN_PERSON">In Person</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 h-20 resize-none" placeholder="Optional" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event types list */}
      <div className="space-y-3">
        {eventTypes.length === 0 ? (
          <div className="bg-white border rounded-xl p-12 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No event types yet</p>
            <button onClick={() => setShowCreate(true)}
              className="text-blue-600 hover:underline">Create your first event type</button>
          </div>
        ) : filteredEventTypes.length === 0 ? (
          <div className="bg-white border rounded-xl p-8 text-center">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No event types matching &ldquo;{debouncedSearch}&rdquo;</p>
            <button onClick={() => { setSearch(""); searchRef.current?.focus() }}
              className="text-blue-600 text-sm hover:underline mt-2 inline-block">Clear search</button>
          </div>
        ) : filteredEventTypes.map((et) => (
          <div key={et.id} className="bg-white border rounded-xl p-5 flex items-center justify-between hover:shadow-sm transition">
            <div className="flex items-center gap-4">
              <div className="w-2 h-12 rounded-full" style={{ backgroundColor: et.color }} />
              <div>
                <h3 className="font-semibold">{et.title}</h3>
                <p className="text-sm text-gray-500">
                  {formatDuration(et.duration)} · {et.location.replace("_", " ")} · {et._count?.bookings || 0} bookings
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => copyLink(et.slug, user?.slug || "")} className="p-2 hover:bg-gray-100 rounded-lg" title="Copy link">
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
              <Link href={`/dashboard/event-types/${et.id}`} className="p-2 hover:bg-gray-100 rounded-lg" title="Edit">
                <ExternalLink className="w-4 h-4 text-gray-500" />
              </Link>
              <button onClick={() => handleDelete(et.id)} className="p-2 hover:bg-gray-100 rounded-lg" title="Delete">
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
