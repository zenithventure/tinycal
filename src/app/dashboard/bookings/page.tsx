"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Clock, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"

const PAGE_SIZE = 10

interface Booking {
  id: string
  uid: string
  title: string
  startTime: string
  endTime: string
  bookerName: string
  bookerEmail: string
  meetingUrl?: string | null
  status: string
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState<string>("upcoming")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const searchRef = useRef<HTMLInputElement>(null)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/bookings").then(r => r.json()).then(setBookings)
  }, [])

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1)
  }, [filter, debouncedSearch])

  const filtered = bookings.filter(b => {
    if (filter === "upcoming") return b.status === "CONFIRMED" && new Date(b.startTime) > new Date()
    if (filter === "past") return b.status === "COMPLETED" || new Date(b.startTime) < new Date()
    if (filter === "cancelled") return b.status === "CANCELLED"
    return true
  }).filter(b => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      b.title?.toLowerCase().includes(q) ||
      b.bookerName?.toLowerCase().includes(q) ||
      b.bookerEmail?.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCancel(b: Booking) {
    setCancelTarget(b)
    setCancelReason("")
    setCancelError(null)
  }

  function closeCancel() {
    if (cancelling) return
    setCancelTarget(null)
    setCancelReason("")
    setCancelError(null)
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/bookings/${cancelTarget.uid}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCancelError(data.error || "Failed to cancel booking")
        setCancelling(false)
        return
      }
      setBookings(prev =>
        prev.map(b => (b.id === cancelTarget.id ? { ...b, status: "CANCELLED" } : b))
      )
      setCancelTarget(null)
      setCancelReason("")
    } catch {
      setCancelError("Network error. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  function isActionable(b: Booking) {
    return b.status === "CONFIRMED" && new Date(b.startTime) > new Date()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Bookings</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or title..."
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

      <div className="flex gap-2 mb-6">
        {["upcoming", "past", "cancelled", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${filter === f ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            {debouncedSearch ? (
              <>
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No bookings matching &ldquo;{debouncedSearch}&rdquo;</p>
                <button onClick={() => { setSearch(""); searchRef.current?.focus() }}
                  className="text-blue-600 text-sm hover:underline mt-2 inline-block">Clear search</button>
              </>
            ) : (
              <>
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-2">No {filter === "all" ? "" : filter + " "}bookings found</p>
                <Link href="/dashboard/event-types" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
                  Create an event type to get started
                </Link>
              </>
            )}
          </div>
        ) : paginated.map(b => (
          <div key={b.id} className="p-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{b.title}</p>
              <p className="text-sm text-gray-600">
                {format(new Date(b.startTime), "EEE, MMM d, yyyy")} at {format(new Date(b.startTime), "h:mm a")} — {format(new Date(b.endTime), "h:mm a")}
              </p>
              <p className="text-sm text-gray-500 truncate">{b.bookerName} · {b.bookerEmail}</p>
              {b.meetingUrl && (
                <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">Join meeting</a>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isActionable(b) && (
                <>
                  <Link
                    href={`/reschedule/${b.uid}`}
                    className="text-sm px-3 py-1.5 border rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Reschedule
                  </Link>
                  <button
                    onClick={() => openCancel(b)}
                    className="text-sm px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                </>
              )}
              <span className={`text-xs px-2 py-1 rounded-full ${
                b.status === "CONFIRMED" ? "bg-green-100 text-green-700" :
                b.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                b.status === "RESCHEDULED" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-700"
              }`}>{b.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <Modal open={!!cancelTarget} onClose={closeCancel} title="Cancel booking">
        {cancelTarget && (
          <div>
            <p className="text-sm text-gray-600 mb-1">
              Cancel <span className="font-medium text-gray-900">{cancelTarget.title}</span> with{" "}
              <span className="font-medium text-gray-900">{cancelTarget.bookerName}</span>?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {format(new Date(cancelTarget.startTime), "EEE, MMM d, yyyy")} at {format(new Date(cancelTarget.startTime), "h:mm a")}
            </p>
            <label className="block text-sm font-medium mb-1" htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 h-24 resize-none text-sm"
              placeholder="Shared with the booker in the cancellation email."
            />
            {cancelError && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{cancelError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={closeCancel}
                disabled={cancelling}
                className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Keep booking
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel booking"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
