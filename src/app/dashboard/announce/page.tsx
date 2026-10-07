"use client"

import { useEffect, useState } from "react"

interface Entry { id: string; title: string; date: string; description: string }

export default function AnnouncePage() {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/announce").then(async (r) => {
      if (!r.ok) return setForbidden(true)
      setEntry((await r.json()).entry)
    })
  }, [])

  async function run(dryRun: boolean) {
    if (!dryRun && !confirm("Email this release to all subscribed users?")) return
    setBusy(true)
    setMessage(null)
    const r = await fetch("/api/admin/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    })
    const data = await r.json()
    setBusy(false)
    if (!r.ok) return setMessage(data.error || "Failed")
    setMessage(
      dryRun
        ? `Dry run: ${data.recipients} recipient(s), nothing sent.`
        : `Sent ${data.sent} of ${data.recipients} (${data.failed} failed).`
    )
  }

  if (forbidden) return <p className="text-gray-600">Admins only.</p>
  if (!entry) return <p className="text-gray-600">Loading…</p>

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Announce release</h1>
      <div className="rounded-lg border p-4">
        <p className="font-semibold">{entry.title} <span className="text-sm font-normal text-gray-500">{entry.date}</span></p>
        <p className="mt-1 text-sm text-gray-600">{entry.description}</p>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => run(true)} className="rounded border px-4 py-2 text-sm">Dry run</button>
        <button disabled={busy} onClick={() => run(false)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Send to all users</button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </div>
  )
}
