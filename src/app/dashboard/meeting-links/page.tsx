"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Link2, Copy, Check, ExternalLink, MessageCircle } from "lucide-react"

interface EventType {
  id: string
  title: string
  duration: number
  location: string
}

export default function MeetingLinksPage() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [eventTypeId, setEventTypeId] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [recipientNote, setRecipientNote] = useState("")

  useEffect(() => {
    fetch("/api/event-types").then(r => r.json()).then((data) => {
      const active = Array.isArray(data) ? data.filter((et: any) => et.active) : []
      setEventTypes(active)
      if (active.length > 0) setEventTypeId(active[0].id)
    })
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!eventTypeId || !date || !time) return

    setLoading(true)
    setError(null)
    setShareUrl(null)

    const startTime = new Date(`${date}T${time}`).toISOString()

    try {
      const res = await fetch("/api/meeting-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId,
          startTime,
          recipientName: recipientName || undefined,
          recipientEmail: recipientEmail || undefined,
          recipientNote: recipientNote || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setShareUrl(data.shareUrl)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to create meeting link")
      }
    } catch {
      setError("Failed to create meeting link")
    }
    setLoading(false)
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleWhatsAppShare() {
    if (!shareUrl) return
    const selectedET = eventTypes.find(et => et.id === eventTypeId)
    const text = `Hey! Here's the link to confirm our ${selectedET?.title || "meeting"}: ${shareUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
  }

  function handleReset() {
    setShareUrl(null)
    setCopied(false)
    setRecipientName("")
    setRecipientEmail("")
    setRecipientNote("")
    setDate("")
    setTime("")
  }

  const selectedET = eventTypes.find(et => et.id === eventTypeId)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Meeting Links</h1>
      <p className="text-gray-600 mb-6">Create a shareable link for a pre-agreed meeting time. Send it via WhatsApp, chat, or email.</p>

      {shareUrl ? (
        /* Success — show share URL */
        <div className="bg-white border rounded-xl p-6 max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold">Meeting Link Created</h2>
              <p className="text-sm text-gray-600">
                {selectedET?.title} · {selectedET?.duration} min
                {date && time && ` · ${format(new Date(`${date}T${time}`), "MMM d 'at' h:mm a")}`}
              </p>
            </div>
          </div>

          {recipientEmail && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mb-4">
              An invitation email has been sent to {recipientEmail}
            </p>
          )}

          {/* Share URL */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700"
            />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleWhatsAppShare}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition"
            >
              <MessageCircle className="w-4 h-4" />
              Share via WhatsApp
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition"
            >
              <ExternalLink className="w-4 h-4" />
              Preview
            </a>
          </div>

          <button onClick={handleReset} className="mt-6 text-sm text-blue-600 hover:underline">
            Create another meeting link
          </button>
        </div>
      ) : (
        /* Creation form */
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-6 max-w-lg space-y-5">
          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
            {eventTypes.length === 0 ? (
              <p className="text-sm text-gray-500">No event types found. Create one first.</p>
            ) : (
              <select
                value={eventTypeId}
                onChange={e => setEventTypeId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {eventTypes.map(et => (
                  <option key={et.id} value={et.id}>{et.title} ({et.duration} min)</option>
                ))}
              </select>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {selectedET && date && time && (
            <p className="text-xs text-gray-500">
              {format(new Date(`${date}T${time}`), "EEEE, MMMM d 'at' h:mm a")} · {selectedET.duration} min
            </p>
          )}

          {/* Recipient Info (optional) */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Recipient Details <span className="text-gray-400 font-normal">(optional)</span></p>
            <div className="space-y-3">
              <input
                type="text"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="Recipient name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="Recipient email (will send invitation)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <textarea
                value={recipientNote}
                onChange={e => setRecipientNote(e.target.value)}
                placeholder="Add a note (e.g., 'Looking forward to our chat!')"
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !eventTypeId || !date || !time}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Link2 className="w-4 h-4" />
            {loading ? "Creating..." : "Create Meeting Link"}
          </button>
        </form>
      )}
    </div>
  )
}
