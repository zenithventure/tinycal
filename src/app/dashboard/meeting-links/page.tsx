"use client"

import { useEffect, useState } from "react"
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { Link2, Copy, Check, ExternalLink, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react"

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
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [recipientNote, setRecipientNote] = useState("")

  // Calendar + slot state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotError, setSlotError] = useState(false)
  const [timezone, setTimezone] = useState("")

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  useEffect(() => {
    fetch("/api/event-types").then(r => r.json()).then((data) => {
      const active = Array.isArray(data) ? data.filter((et: any) => et.active) : []
      setEventTypes(active)
      if (active.length > 0) setEventTypeId(active[0].id)
    })
  }, [])

  // Fetch slots when date or event type changes
  useEffect(() => {
    if (!selectedDate || !timezone || !eventTypeId) return
    setLoadingSlots(true)
    setSlotError(false)
    setSelectedSlot(null)
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    fetch(`/api/slots?eventTypeId=${eventTypeId}&date=${dateStr}&timezone=${timezone}`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load slots")
        return r.json()
      })
      .then(data => {
        setSlots(Array.isArray(data) ? data : [])
        setLoadingSlots(false)
      })
      .catch(() => {
        setSlots([])
        setLoadingSlots(false)
        setSlotError(true)
      })
  }, [selectedDate, timezone, eventTypeId])

  // Calendar
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!eventTypeId || !selectedSlot) return

    setLoading(true)
    setError(null)
    setShareUrl(null)

    try {
      const res = await fetch("/api/meeting-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId,
          startTime: selectedSlot,
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
    setSelectedDate(null)
    setSelectedSlot(null)
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
                {selectedSlot && ` · ${format(toZonedTime(new Date(selectedSlot), timezone), "MMM d 'at' h:mm a")}`}
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
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-6 max-w-2xl space-y-5">
          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
            {eventTypes.length === 0 ? (
              <p className="text-sm text-gray-500">No event types found. Create one first.</p>
            ) : (
              <select
                value={eventTypeId}
                onChange={e => { setEventTypeId(e.target.value); setSelectedDate(null); setSelectedSlot(null) }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {eventTypes.map(et => (
                  <option key={et.id} value={et.id}>{et.title} ({et.duration} min)</option>
                ))}
              </select>
            )}
          </div>

          {/* Calendar + Time Slots */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Date & Time</label>
            <div className="flex gap-6">
              {/* Calendar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm">{format(currentMonth, "MMMM yyyy")}</h3>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="p-1 hover:bg-gray-100 rounded">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calDays.map(day => {
                    const isCurrentMonth = isSameMonth(day, currentMonth)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const isPast = day < new Date(new Date().toDateString())
                    return (
                      <button
                        type="button"
                        key={day.toISOString()}
                        onClick={() => { setSelectedDate(day); setSelectedSlot(null) }}
                        disabled={isPast || !isCurrentMonth}
                        className={`h-9 rounded-lg text-sm transition ${
                          isSelected
                            ? "bg-blue-600 text-white font-bold"
                            : isPast || !isCurrentMonth
                            ? "text-gray-300"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {format(day, "d")}
                      </button>
                    )
                  })}
                </div>

                {/* Timezone */}
                <div className="mt-3">
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1 text-gray-600"
                  >
                    {typeof Intl !== "undefined" && Intl.supportedValuesOf("timeZone").map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time Slots */}
              <div className="w-40">
                {selectedDate ? (
                  <>
                    <h3 className="font-medium text-sm mb-2">{format(selectedDate, "EEE, MMM d")}</h3>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {loadingSlots ? (
                        [...Array(5)].map((_, i) => (
                          <div key={i} className="h-9 bg-gray-200 animate-pulse rounded-lg" />
                        ))
                      ) : slotError ? (
                        <div className="text-center">
                          <p className="text-sm text-red-600 mb-2">Failed to load</p>
                          <button
                            type="button"
                            onClick={() => setSelectedDate(new Date(selectedDate!))}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Try again
                          </button>
                        </div>
                      ) : slots.length === 0 ? (
                        <p className="text-sm text-gray-500">No available times</p>
                      ) : slots.map(slot => {
                        const time = toZonedTime(new Date(slot.start), timezone)
                        const isSelected = selectedSlot === slot.start
                        return (
                          <button
                            type="button"
                            key={slot.start}
                            onClick={() => setSelectedSlot(slot.start)}
                            className={`w-full text-sm py-2 px-3 rounded-lg border transition text-center ${
                              isSelected ? "bg-blue-600 text-white border-blue-600" : "hover:border-blue-300"
                            }`}
                          >
                            {format(time, "h:mm a")}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-6">Select a date to see available times</p>
                )}
              </div>
            </div>
          </div>

          {/* Selected slot summary */}
          {selectedET && selectedSlot && (
            <p className="text-xs text-gray-500">
              {format(toZonedTime(new Date(selectedSlot), timezone), "EEEE, MMMM d 'at' h:mm a")} · {selectedET.duration} min
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
            disabled={loading || !eventTypeId || !selectedSlot}
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
