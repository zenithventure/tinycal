"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, endOfWeek } from "date-fns"

export default function ReschedulePage() {
  const { uid } = useParams()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [booking, setBooking] = useState<any>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const timezone = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"

  useEffect(() => {
    fetch(`/api/bookings/${uid}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setBooking(d) })
  }, [uid])

  useEffect(() => {
    if (!selectedDate || !booking?.eventTypeId) return
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    fetch(`/api/slots?eventTypeId=${booking.eventTypeId}&date=${dateStr}&timezone=${timezone}`)
      .then(r => r.json())
      .then(d => setSlots(Array.isArray(d) ? d : []))
  }, [selectedDate, booking, timezone])

  async function handleReschedule() {
    if (!selectedSlot) return
    setLoading(true)
    const res = await fetch(`/api/bookings/${uid}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newStartTime: selectedSlot }),
    })
    if (res.ok) setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Rescheduled!</h1>
          <p className="text-gray-600">Your booking has been rescheduled. A confirmation email is on its way.</p>
        </div>
      </div>
    )
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) })

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border p-6">
        <h1 className="text-xl font-bold mb-2">Reschedule Booking</h1>
        <p className="text-sm text-gray-600 mb-6">Pick a new time for your meeting.</p>

        {/* Calendar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex gap-1">
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-2">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 mb-4">
          {calDays.map(day => {
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const isPast = day < new Date(new Date().toDateString())
            return (
              <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
                disabled={isPast || !isCurrentMonth}
                className={`h-9 rounded text-sm ${isSelected ? "bg-blue-600 text-white" : isPast || !isCurrentMonth ? "text-gray-300" : "hover:bg-gray-100"}`}>
                {format(day, "d")}
              </button>
            )
          })}
        </div>

        {/* Slots */}
        {selectedDate && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-2">{format(selectedDate, "EEE, MMM d")}</h3>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {slots.length === 0 ? (
                <p className="text-sm text-gray-500 col-span-3">No available times</p>
              ) : slots.map((s: any) => {
                const t = toZonedTime(new Date(s.start), timezone)
                return (
                  <button key={s.start} onClick={() => setSelectedSlot(s.start)}
                    className={`text-sm py-2 rounded border ${selectedSlot === s.start ? "bg-blue-600 text-white border-blue-600" : "hover:border-blue-300"}`}>
                    {format(t, "h:mm a")}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selectedSlot && (
          <button onClick={handleReschedule} disabled={loading}
            className="w-full mt-4 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Rescheduling..." : "Confirm New Time"}
          </button>
        )}
      </div>
    </div>
  )
}
