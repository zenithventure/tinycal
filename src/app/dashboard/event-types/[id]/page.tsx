"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save, X, AlertCircle, Users } from "lucide-react"
import Link from "next/link"

interface CoHost {
  id: string
  name: string | null
  email: string | null
}

interface Schedule {
  id: string
  name: string
  isDefault: boolean
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

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateSlug(s: string): string | null {
  if (s.length === 0) return "Slug can't be empty"
  if (s.length > 80) return "Slug must be 80 characters or fewer"
  if (!SLUG_PATTERN.test(s)) {
    return "Slug must be lowercase letters, digits, and single hyphens (no leading/trailing)"
  }
  return null
}

export default function EditEventTypePage() {
  const params = useParams()
  const router = useRouter()
  const [et, setEt] = useState<any>(null)
  const [originalSlug, setOriginalSlug] = useState<string>("")
  const [userSlug, setUserSlug] = useState<string>("")
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [resolution, setResolution] = useState<ResolutionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [coHostEmail, setCoHostEmail] = useState("")
  const [coHostError, setCoHostError] = useState<string | null>(null)
  const [coHostAdding, setCoHostAdding] = useState(false)

  useEffect(() => {
    fetch(`/api/event-types/${params.id}`).then(r => r.json()).then(data => {
      setEt(data)
      setOriginalSlug(data.slug ?? "")
    })
    fetch("/api/user").then(r => r.json()).then(u => setUserSlug(u?.slug ?? ""))
    fetch("/api/availability/schedules").then(r => r.json()).then(setSchedules)
    fetch("/api/availability/resolution")
      .then(r => r.ok ? r.json() : null)
      .then(setResolution)
      .catch(() => setResolution(null))
  }, [params.id])

  const slugError = et?.slug != null ? validateSlug(et.slug) : null
  const slugChanged = et != null && et.slug !== originalSlug

  async function handleSave() {
    setSaveError(null)

    if (slugError) {
      setSaveError(slugError)
      return
    }

    if (slugChanged) {
      const ok = confirm(
        `Changing the slug from "${originalSlug}" to "${et.slug}" will break any existing booking links you've shared. Existing bookings keep working — only future links are affected.\n\nContinue?`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/event-types/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(et),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error || `Save failed (HTTP ${res.status})`)
        return
      }
      router.push("/dashboard/event-types")
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Network error")
    } finally {
      setSaving(false)
    }
  }

  async function addCoHost() {
    const email = coHostEmail.trim().toLowerCase()
    if (!email) return
    setCoHostError(null)

    if (email === et.user?.email) {
      setCoHostError("That's the event-type owner — already a host by default")
      return
    }
    if ((et.collectiveHosts ?? []).some((h: CoHost) => h.email === email)) {
      setCoHostError("Already added")
      return
    }

    setCoHostAdding(true)
    try {
      const res = await fetch(`/api/users/lookup?email=${encodeURIComponent(email)}`)
      const body = await res.json()
      if (!res.ok) {
        setCoHostError(body.error || "Lookup failed")
        return
      }
      const newHost: CoHost = body.data
      setEt({
        ...et,
        collectiveMembers: [...(et.collectiveMembers ?? []), newHost.id],
        collectiveHosts: [...(et.collectiveHosts ?? []), newHost],
      })
      setCoHostEmail("")
    } finally {
      setCoHostAdding(false)
    }
  }

  function removeCoHost(id: string) {
    setEt({
      ...et,
      collectiveMembers: (et.collectiveMembers ?? []).filter((x: string) => x !== id),
      collectiveHosts: (et.collectiveHosts ?? []).filter((h: CoHost) => h.id !== id),
    })
  }

  if (!et) return <div className="animate-pulse">Loading...</div>

  const isCoHost = et.viewerRole === "CO_HOST"
  const readOnly = isCoHost
  const showsEmptyCollectiveWarning =
    !isCoHost && et.isCollective && (et.collectiveMembers ?? []).length === 0

  const previewHost = typeof window !== "undefined" ? window.location.host : "tinycal.zenithstudio.app"
  // For co-hosted events the booking page lives under the owner's slug, not the
  // viewer's — using the viewer's slug here would render a 404 link.
  const ownerSlug = isCoHost ? (et.user?.slug ?? "") : userSlug
  const slugUrlPreview = ownerSlug ? `${previewHost}/${ownerSlug}/${et.slug}` : null

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/event-types" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold">{readOnly ? "Event Type" : "Edit Event Type"}</h1>
      </div>

      {readOnly && (
        <div className="mb-4 flex items-start gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            You&apos;re a <strong>co-host</strong> on this event type. Only the
            owner{et.user?.name ? ` (${et.user.name})` : et.user?.email ? ` (${et.user.email})` : ""} can edit it —
            reach out to them if something needs to change.
          </div>
        </div>
      )}

      <fieldset disabled={readOnly} className="bg-white border rounded-xl p-6 space-y-6 disabled:opacity-90">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input type="text" value={et.title} onChange={e => setEt({ ...et, title: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input
            type="text"
            value={et.slug ?? ""}
            onChange={e => setEt({ ...et, slug: e.target.value })}
            placeholder="discovery-call"
            className={`w-full border rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none ${slugError ? "border-red-300" : ""}`}
          />
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            {slugUrlPreview ? <>Booking page: <code className="text-gray-700">{slugUrlPreview}</code></> : "Used in the booking page URL and the API"}
          </div>
          {slugError && (
            <div className="text-xs text-red-700 mt-1">{slugError}</div>
          )}
          {slugChanged && !slugError && (
            <div className="text-xs text-amber-700 mt-1">
              Changing the slug will break any links you&apos;ve already shared.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Duration (min)</label>
            <select value={et.duration} onChange={e => setEt({ ...et, duration: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2">
              {[15, 20, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d}</option>)}
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
        <h3 className="font-semibold">Availability & Scheduling</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Availability Schedule</label>
          <select
            value={et.availabilityScheduleId || ""}
            onChange={e => setEt({ ...et, availabilityScheduleId: e.target.value || null })}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Use user default schedule</option>
            {schedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isDefault ? "(default)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Event type schedules override user defaults.
          </p>
          <EffectiveSourceNote
            eventTypeId={params.id as string}
            resolution={resolution}
            pendingScheduleId={et.availabilityScheduleId ?? null}
          />
        </div>

        <h3 className="font-semibold mt-4">Scheduling Rules</h3>
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

        {et.isCollective && (
          <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
            <div>
              <h4 className="font-medium text-sm">Co-hosts</h4>
              <p className="text-xs text-gray-600 mt-1">
                Add other TinyCal users whose availability and connected calendars must also be free for a slot to be bookable.
              </p>
            </div>

            {(et.collectiveHosts ?? []).length > 0 && (
              <ul className="space-y-2">
                {(et.collectiveHosts as CoHost[]).map(h => (
                  <li key={h.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{h.name || "(no name)"}</div>
                      <div className="text-xs text-gray-600">{h.email}</div>
                    </div>
                    <button type="button" onClick={() => removeCoHost(h.id)}
                      aria-label={`Remove ${h.email}`}
                      className="p-1 hover:bg-gray-100 rounded">
                      <X className="w-4 h-4 text-gray-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showsEmptyCollectiveWarning && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Collective scheduling is on but no co-hosts are added —
                  bookings will only check your availability.
                </span>
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); addCoHost() }} className="flex gap-2">
              <input
                type="email"
                value={coHostEmail}
                onChange={e => { setCoHostEmail(e.target.value); setCoHostError(null) }}
                placeholder="co-host@example.com"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button type="submit" disabled={coHostAdding || !coHostEmail.trim()}
                className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                {coHostAdding ? "Adding..." : "Add"}
              </button>
            </form>

            {coHostError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {coHostError}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input type="checkbox" checked={et.active} onChange={e => setEt({ ...et, active: e.target.checked })}
            className="rounded" id="active" />
          <label htmlFor="active" className="text-sm">Active (visible on booking page)</label>
        </div>

        {saveError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {saveError}
          </div>
        )}

        {!readOnly && (
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving || !!slugError}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </fieldset>
    </div>
  )
}

// Reflects the cascade in resolveAvailabilityRules so the editor can name the
// actual winning source. Falls back to the saved-state summary when the user
// hasn't touched the dropdown — otherwise we'd lie about a value they can't
// see locally (rule counts for schedules).
function EffectiveSourceNote({
  eventTypeId,
  resolution,
  pendingScheduleId,
}: {
  eventTypeId: string
  resolution: ResolutionSummary | null
  pendingScheduleId: string | null
}) {
  if (!resolution) return null

  const saved = resolution.eventTypes.find(e => e.id === eventTypeId)
  // No saved entry yet (brand-new event type) — fall back to defaults-only logic.
  const savedScheduleId = saved?.scheduleId ?? null

  // If the user's pending pick matches what we already resolved, trust it.
  // Otherwise re-derive *as if* only the schedule pointer changed, using the
  // counts we know server-side.
  let source: ResolutionEventType["source"]
  let scheduleName: string | null = null

  if (saved && pendingScheduleId === savedScheduleId) {
    source = saved.source
    scheduleName = saved.scheduleName
  } else if (pendingScheduleId) {
    // We don't know the picked schedule's rule count client-side — assume the
    // selection wins and hint that saving will confirm.
    source = "EVENT_TYPE_SCHEDULE"
  } else if (resolution.defaultSchedule && resolution.defaultSchedule.ruleCount > 0) {
    source = "USER_DEFAULT_SCHEDULE"
    scheduleName = resolution.defaultSchedule.name
  } else if (resolution.legacyRuleCount > 0) {
    source = "LEGACY_AVAILABILITY"
  } else {
    source = "NONE"
  }

  const pendingDiffers = saved != null && pendingScheduleId !== savedScheduleId
  const label =
    source === "EVENT_TYPE_SCHEDULE"
      ? `Currently using this event type's linked schedule${scheduleName ? ` (“${scheduleName}”)` : ""}.`
      : source === "USER_DEFAULT_SCHEDULE"
      ? `Currently using your default schedule${scheduleName ? ` (“${scheduleName}”)` : ""} — legacy availability rows are being shadowed.`
      : source === "LEGACY_AVAILABILITY"
      ? `Currently using your legacy Availability rules (no schedule is linked or has rules).`
      : `No availability source resolves — bookings won't have any slots until you add rules.`

  const tone =
    source === "NONE"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : source === "LEGACY_AVAILABILITY"
      ? "text-blue-800 bg-blue-50 border-blue-200"
      : "text-gray-700 bg-gray-50 border-gray-200"

  return (
    <div className={`mt-2 text-xs border rounded px-3 py-2 ${tone}`}>
      <div>{label}</div>
      {pendingDiffers && (
        <div className="mt-1 text-gray-600">
          You changed the selection — save to apply.
        </div>
      )}
    </div>
  )
}
