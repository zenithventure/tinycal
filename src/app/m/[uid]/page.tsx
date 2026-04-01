"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { Check, Calendar, Download, Clock, MapPin, User, ExternalLink, Phone, Linkedin } from "lucide-react"

interface MeetingData {
  uid: string
  title: string
  startTime: string
  endTime: string
  bookerName: string
  bookerEmail: string
  status: string
  location: string
  meetingUrl: string | null
  recipientNote: string | null
  confirmedAt: string | null
  eventType: { title: string; duration: number; slug: string }
  user: { name: string | null; image: string | null; brandColor: string | null; slug: string | null }
}

function googleCalendarUrl(title: string, start: Date, end: Date, location?: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const url = new URL("https://calendar.google.com/calendar/render")
  url.searchParams.set("action", "TEMPLATE")
  url.searchParams.set("text", title)
  url.searchParams.set("dates", `${fmt(start)}/${fmt(end)}`)
  if (location) url.searchParams.set("location", location)
  return url.toString()
}

function outlookCalendarUrl(title: string, start: Date, end: Date, location?: string) {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose")
  url.searchParams.set("subject", title)
  url.searchParams.set("startdt", start.toISOString())
  url.searchParams.set("enddt", end.toISOString())
  if (location) url.searchParams.set("location", location)
  url.searchParams.set("path", "/calendar/action/compose")
  return url.toString()
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  IN_PERSON: "In Person",
  PHONE: "Phone",
  CUSTOM: "Custom",
}

export default function MeetingPage() {
  const { uid } = useParams()
  const [meeting, setMeeting] = useState<MeetingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Confirm form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const timezone = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"

  useEffect(() => {
    fetch(`/api/meeting-links/${uid}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError("Meeting not found")
        } else {
          setMeeting(d)
          if (d.bookerName && d.bookerName !== "Pending") setName(d.bookerName)
          if (d.bookerEmail) setEmail(d.bookerEmail)
          if (d.status === "CONFIRMED") setConfirmed(true)
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Failed to load meeting details")
        setLoading(false)
      })
  }, [uid])

  const hasContactMethod = !!(email || phone || linkedin)

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !hasContactMethod) return
    setConfirming(true)
    setError(null)

    try {
      const res = await fetch(`/api/meeting-links/${uid}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || undefined,
          phone: phone || undefined,
          linkedin: linkedin || undefined,
          timezone,
        }),
      })
      if (res.ok) {
        setConfirmed(true)
        const data = await res.json()
        setMeeting(prev => prev ? { ...prev, ...data, status: "CONFIRMED" } : prev)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to confirm meeting")
      }
    } catch {
      setError("Failed to confirm meeting")
    }
    setConfirming(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error && !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border p-8 text-center">
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!meeting) return null

  const start = new Date(meeting.startTime)
  const end = new Date(meeting.endTime)
  const zonedStart = toZonedTime(start, timezone)
  const zonedEnd = toZonedTime(end, timezone)
  const brandColor = meeting.user.brandColor || "#2563eb"

  // Cancelled state
  if (meeting.status === "CANCELLED") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Meeting Cancelled</h1>
          <p className="text-gray-600">This meeting has been cancelled.</p>
        </div>
      </div>
    )
  }

  // Confirmed state
  if (confirmed || meeting.status === "CONFIRMED") {
    const locationStr = meeting.meetingUrl || LOCATION_LABELS[meeting.location] || meeting.location

    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 text-center" style={{ borderTop: `4px solid ${brandColor}` }}>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold mb-1">Meeting Confirmed</h1>
            <p className="text-gray-600">You&apos;re all set!</p>
          </div>

          <div className="px-6 pb-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-sm text-gray-600">with {meeting.user.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm">{format(zonedStart, "EEEE, MMMM d, yyyy")}</p>
                  <p className="text-sm text-gray-600">{format(zonedStart, "h:mm a")} - {format(zonedEnd, "h:mm a")}</p>
                  <p className="text-xs text-gray-400">{timezone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm">{LOCATION_LABELS[meeting.location] || meeting.location}</p>
              </div>
            </div>
          </div>

          {/* Meeting URL */}
          {meeting.meetingUrl && (
            <div className="px-6 pb-4">
              <a
                href={meeting.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: brandColor }}
              >
                <ExternalLink className="w-4 h-4" />
                Join Meeting
              </a>
            </div>
          )}

          {/* Add to Calendar buttons */}
          <div className="px-6 pb-6 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Add to Calendar</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={googleCalendarUrl(meeting.title, start, end, locationStr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-sm hover:bg-gray-50 transition"
              >
                <Calendar className="w-4 h-4" />
                Google
              </a>
              <a
                href={outlookCalendarUrl(meeting.title, start, end, locationStr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-sm hover:bg-gray-50 transition"
              >
                <Calendar className="w-4 h-4" />
                Outlook
              </a>
            </div>
            <a
              href={`/api/meeting-links/${meeting.uid}/ics`}
              className="flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-sm hover:bg-gray-50 transition w-full"
            >
              <Download className="w-4 h-4" />
              Download .ics file
            </a>
          </div>

          {/* Reschedule / Cancel */}
          <div className="px-6 pb-6 flex justify-center gap-4 text-sm">
            <a href={`/reschedule/${meeting.uid}`} className="text-gray-500 hover:text-gray-700 underline">Reschedule</a>
            <a href={`/cancel/${meeting.uid}`} className="text-gray-500 hover:text-gray-700 underline">Cancel</a>
          </div>
        </div>
      </div>
    )
  }

  // Pending confirmation state — show confirm form
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderTop: `4px solid ${brandColor}` }}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            {meeting.user.image ? (
              <img src={meeting.user.image} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: brandColor }}>
                {(meeting.user.name || "?")[0]}
              </div>
            )}
            <div>
              <p className="font-medium">{meeting.user.name}</p>
              <p className="text-sm text-gray-500">invited you to a meeting</p>
            </div>
          </div>

          {/* Meeting details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-6">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <p className="font-medium">{meeting.title}</p>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm">{format(zonedStart, "EEEE, MMMM d, yyyy")}</p>
                <p className="text-sm text-gray-600">{format(zonedStart, "h:mm a")} - {format(zonedEnd, "h:mm a")} ({meeting.eventType.duration} min)</p>
                <p className="text-xs text-gray-400">{timezone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-sm">{LOCATION_LABELS[meeting.location] || meeting.location}</p>
            </div>
          </div>

          {/* Host note */}
          {meeting.recipientNote && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">&ldquo;{meeting.recipientNote}&rdquo;</p>
              <p className="text-xs text-blue-600 mt-1">- {meeting.user.name}</p>
            </div>
          )}

          {/* Confirm form */}
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Enter your name"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">How can they reach you? <span className="text-gray-400 font-normal">(at least one)</span></p>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Email (you@example.com)"
                  />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Phone number"
                  />
                </div>
                <div className="relative">
                  <Linkedin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={linkedin}
                    onChange={e => setLinkedin(e.target.value)}
                    className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="LinkedIn profile URL or handle"
                  />
                </div>
              </div>
              {!hasContactMethod && name && (
                <p className="text-xs text-amber-600 mt-1">Please provide at least one way to reach you</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={confirming || !name || !hasContactMethod}
              className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition"
              style={{ backgroundColor: brandColor }}
            >
              {confirming ? "Confirming..." : "Confirm Meeting"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <a
              href={`/reschedule/${meeting.uid}`}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Need a different time? Suggest a new time
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
