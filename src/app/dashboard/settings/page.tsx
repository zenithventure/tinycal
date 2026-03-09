"use client"

import { useEffect, useState, useCallback } from "react"
import { Save, ExternalLink, Trash2, Star, Tag } from "lucide-react"

const MAX_CALENDARS = 6

interface CalendarConnection {
  id: string
  provider: "GOOGLE" | "OUTLOOK"
  email: string
  isPrimary: boolean
  checkConflicts: boolean
  label: string | null
}

const providerInfo: Record<string, { name: string; icon: string }> = {
  GOOGLE: { name: "Google Calendar", icon: "G" },
  OUTLOOK: { name: "Outlook / Office 365", icon: "O" },
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [calendars, setCalendars] = useState<CalendarConnection[]>([])
  const [calendarErrors, setCalendarErrors] = useState<Record<string, string>>({})
  const [updatingCalendar, setUpdatingCalendar] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((data) => {
        setUser(data)
        setCalendars(data.calendarConnections || [])
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: user.name,
        timezone: user.timezone,
        slug: user.slug,
        brandColor: user.brandColor,
        brandLogo: user.brandLogo,
      }),
    })
    setSaving(false)
  }

  async function handleUpgrade(yearly: boolean) {
    const priceId = yearly
      ? process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID
      : process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    })
    const { url } = await res.json()
    window.location.href = url
  }

  async function handleManageBilling() {
    const res = await fetch("/api/stripe/portal", { method: "POST" })
    const { url } = await res.json()
    window.location.href = url
  }

  async function connectGoogle() {
    window.location.href = "/api/auth/google"
  }

  async function connectOutlook() {
    window.location.href = "/api/auth/outlook"
  }

  const updateCalendar = useCallback(
    async (id: string, updates: Partial<Pick<CalendarConnection, "label" | "checkConflicts" | "isPrimary">>) => {
      setUpdatingCalendar(id)
      setCalendarErrors((prev) => ({ ...prev, [id]: "" }))

      try {
        const res = await fetch(`/api/calendar-connections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        })

        if (!res.ok) {
          const data = await res.json()
          setCalendarErrors((prev) => ({ ...prev, [id]: data.error }))
          return
        }

        // Refresh calendars from server to get consistent state
        const userRes = await fetch("/api/user")
        const userData = await userRes.json()
        setCalendars(userData.calendarConnections || [])
      } catch {
        setCalendarErrors((prev) => ({
          ...prev,
          [id]: "Failed to update calendar settings",
        }))
      } finally {
        setUpdatingCalendar(null)
      }
    },
    []
  )

  const disconnectCalendar = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this calendar?")) return

    setUpdatingCalendar(id)
    setCalendarErrors((prev) => ({ ...prev, [id]: "" }))

    try {
      const res = await fetch(`/api/calendar-connections/${id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json()
        setCalendarErrors((prev) => ({ ...prev, [id]: data.error }))
        return
      }

      // Refresh calendars from server
      const userRes = await fetch("/api/user")
      const userData = await userRes.json()
      setCalendars(userData.calendarConnections || [])
    } catch {
      setCalendarErrors((prev) => ({
        ...prev,
        [id]: "Failed to disconnect calendar",
      }))
    } finally {
      setUpdatingCalendar(null)
    }
  }, [])

  if (!user) return <div className="animate-pulse">Loading...</div>

  const timezones = Intl.supportedValuesOf("timeZone")
  const calendarCount = calendars.length
  const limitReached = calendarCount >= MAX_CALENDARS

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={user.name || ""}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL Slug</label>
            <div className="flex items-center border rounded-lg overflow-hidden">
              <span className="bg-gray-50 px-3 py-2 text-sm text-gray-500 border-r">
                tinycal.io/
              </span>
              <input
                type="text"
                value={user.slug || ""}
                onChange={(e) => setUser({ ...user, slug: e.target.value })}
                className="flex-1 px-3 py-2 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <select
              value={user.timezone}
              onChange={(e) => setUser({ ...user, timezone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>
        </div>

        {/* Branding */}
        <h3 className="font-medium mt-6 mb-3">Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Brand Color</label>
            <input
              type="color"
              value={user.brandColor}
              onChange={(e) => setUser({ ...user, brandColor: e.target.value })}
              className="w-full h-10 border rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              type="url"
              value={user.brandLogo || ""}
              onChange={(e) => setUser({ ...user, brandLogo: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="https://..."
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>

      {/* Calendar Connections */}
      <div className="bg-white border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Connected Calendars ({calendarCount}/{MAX_CALENDARS})
          </h2>
        </div>

        <div className="space-y-3">
          {calendars.map((conn) => {
            const info = providerInfo[conn.provider] || {
              name: conn.provider,
              icon: "?",
            }
            const isUpdating = updatingCalendar === conn.id
            const error = calendarErrors[conn.id]

            return (
              <div
                key={conn.id}
                className={`border rounded-lg p-4 ${isUpdating ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Provider icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                        conn.provider === "GOOGLE"
                          ? "bg-red-500"
                          : "bg-blue-500"
                      }`}
                    >
                      {info.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {info.name}
                        </span>
                        {conn.isPrimary && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <Star className="w-3 h-3" /> Primary
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {conn.email}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!conn.isPrimary && (
                      <button
                        onClick={() =>
                          updateCalendar(conn.id, { isPrimary: true })
                        }
                        disabled={isUpdating}
                        className="text-xs text-gray-500 hover:text-yellow-600 px-2 py-1 rounded hover:bg-yellow-50 transition"
                        title="Set as primary calendar"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => disconnectCalendar(conn.id)}
                      disabled={isUpdating}
                      className="text-xs text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                      title="Disconnect calendar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Label and Conflict Toggle */}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={conn.label || ""}
                      onChange={(e) => {
                        const newLabel = e.target.value
                        setCalendars((prev) =>
                          prev.map((c) =>
                            c.id === conn.id ? { ...c, label: newLabel } : c
                          )
                        )
                      }}
                      onBlur={(e) => {
                        const newLabel = e.target.value || null
                        if (newLabel !== conn.label) {
                          updateCalendar(conn.id, {
                            label: newLabel as any,
                          })
                        }
                      }}
                      placeholder="Add label (e.g., Work, Personal)"
                      className="text-sm border rounded px-2 py-1 w-full max-w-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={isUpdating}
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-sm text-gray-600 whitespace-nowrap">
                      Check for conflicts
                    </span>
                    <button
                      role="switch"
                      aria-checked={conn.checkConflicts}
                      onClick={() =>
                        updateCalendar(conn.id, {
                          checkConflicts: !conn.checkConflicts,
                        })
                      }
                      disabled={isUpdating}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        conn.checkConflicts ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          conn.checkConflicts
                            ? "translate-x-4.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {error && (
                  <p className="text-xs text-red-600 mt-2">{error}</p>
                )}
              </div>
            )
          })}

          {/* Connect buttons */}
          {!limitReached && (
            <div className="space-y-2 mt-4">
              <button
                onClick={connectGoogle}
                className="w-full border-2 border-dashed rounded-lg p-3 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                + Connect Google Calendar
              </button>
              <button
                onClick={connectOutlook}
                className="w-full border-2 border-dashed rounded-lg p-3 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                + Connect Outlook / Office 365
              </button>
            </div>
          )}

          {limitReached && (
            <p className="text-sm text-gray-500 mt-3 text-center">
              Maximum of {MAX_CALENDARS} calendars connected. Disconnect a
              calendar to add a new one.
            </p>
          )}
        </div>
      </div>

      {/* Subscription */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Subscription</h2>
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`text-sm font-medium px-3 py-1 rounded-full ${
              user.plan === "PRO"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {user.plan}
          </span>
          {user.stripeCurrentPeriodEnd && (
            <span className="text-sm text-gray-500">
              Renews{" "}
              {new Date(user.stripeCurrentPeriodEnd).toLocaleDateString()}
            </span>
          )}
        </div>

        {user.plan === "FREE" ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Upgrade to Pro for unlimited event types, signatures, and all
              integrations.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleUpgrade(false)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
              >
                $5/month
              </button>
              <button
                onClick={() => handleUpgrade(true)}
                className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 text-sm"
              >
                $48/year (save 20%)
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleManageBilling}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            Manage billing <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Embed Code */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Embed Widget</h2>
        <p className="text-sm text-gray-600 mb-3">
          Add TinyCal to your website:
        </p>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto">
          {`<!-- TinyCal Embed -->
<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/${user.slug}"
  style="width:100%;height:700px;border:none;"
  loading="lazy"></iframe>`}
        </div>
        <p className="text-sm text-gray-500 mt-3">
          Or use the JavaScript snippet:
        </p>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto mt-2">
          {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/embed.js"
  data-user="${user.slug}"></script>`}
        </div>
      </div>
    </div>
  )
}
