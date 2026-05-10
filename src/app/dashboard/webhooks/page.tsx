"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Copy, AlertTriangle } from "lucide-react"

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [url, setUrl] = useState("")

  useEffect(() => {
    fetch("/api/webhooks").then(r => r.json()).then(d => Array.isArray(d) ? setWebhooks(d) : null)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    const wh = await res.json()
    setWebhooks([wh, ...webhooks])
    setShowCreate(false)
    setUrl("")
  }

  async function handleDelete(id: string) {
    await fetch("/api/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setWebhooks(webhooks.filter(w => w.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <button onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 mb-4 flex gap-3">
          <input type="url" value={url} onChange={e => setUrl(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="https://your-app.com/webhook" required />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Add</button>
          <button type="button" onClick={() => setShowCreate(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
        </form>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {webhooks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No webhooks configured</div>
        ) : webhooks.map(wh => (
          <div key={wh.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-mono">{wh.url}</p>
              <p className="text-xs text-gray-500 mt-1">Events: {wh.events?.join(", ")}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">Secret: {wh.secret?.slice(0, 12)}...</span>
                <button onClick={() => navigator.clipboard.writeText(wh.secret)} className="text-gray-400 hover:text-gray-600">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              {wh.failedDeliveryCount24h > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-amber-700">
                  <AlertTriangle className="w-3 h-3" />
                  {wh.failedDeliveryCount24h} failed {wh.failedDeliveryCount24h === 1 ? "delivery" : "deliveries"} in last 24h
                </div>
              )}
            </div>
            <button onClick={() => handleDelete(wh.id)} className="p-2 hover:bg-red-50 rounded-lg">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
