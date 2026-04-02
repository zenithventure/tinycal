"use client"

import { useState, useRef } from "react"
import { Check, ExternalLink, ImagePlus, X } from "lucide-react"

const categories = [
  "Bug Report",
  "Feature Request",
  "Billing",
  "Calendar Integration",
  "General Question",
]

const MAX_FILES = 3
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export default function SupportPage() {
  const [category, setCategory] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [ticket, setTicket] = useState<{ ticketId: string; trackingUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    const valid = selected.filter((f) => {
      if (!f.type.startsWith("image/")) {
        setError(`"${f.name}" is not an image`)
        return false
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" exceeds 5MB limit`)
        return false
      }
      return true
    })
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append("category", category)
    formData.append("subject", subject)
    formData.append("message", message)
    files.forEach((f, i) => formData.append(`file${i}`, f))

    const res = await fetch("/api/support", {
      method: "POST",
      body: formData,
    })

    if (res.ok) {
      const data = await res.json()
      setTicket({ ticketId: data.ticketId, trackingUrl: data.trackingUrl })
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || "Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  if (ticket) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Ticket Submitted</h1>
        <p className="text-gray-600 mb-2">
          Your support ticket <span className="font-semibold text-gray-900">{ticket.ticketId}</span> has been created.
        </p>
        <p className="text-gray-600 mb-6">
          You can track the progress of your ticket at any time.
        </p>
        <div className="flex flex-col items-center gap-3">
          <a
            href={ticket.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition"
          >
            Track Ticket
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={() => { setTicket(null); setSubject(""); setMessage(""); setCategory(""); setFiles([]) }}
            className="text-blue-600 hover:underline text-sm"
          >
            Submit another ticket
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Support</h1>
      <p className="text-gray-600 mb-6">Have a question or issue? Submit a ticket and track its progress.</p>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subject <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of your issue"
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message <span className="text-red-500">*</span></label>
          <textarea
            required
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your issue or question in detail..."
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Screenshots <span className="text-gray-400 font-normal">(optional, up to 3)</span></label>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 text-sm">
                  <span className="truncate max-w-[150px]">{f.name}</span>
                  <span className="text-gray-400 text-xs">({(f.size / 1024).toFixed(0)}KB)</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 ml-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {files.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-gray-600 border border-dashed rounded-lg px-4 py-2.5 hover:border-blue-400 hover:text-blue-600 transition w-full justify-center"
            >
              <ImagePlus className="w-4 h-4" />
              Add screenshot
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !subject.trim() || !message.trim()}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>
    </div>
  )
}
