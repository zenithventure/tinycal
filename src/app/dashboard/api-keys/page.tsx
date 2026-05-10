"use client"

import { useEffect, useState } from "react"
import { Plus, Copy, Check, AlertTriangle, KeyRound } from "lucide-react"

interface ApiKey {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

interface CreatedKey {
  id: string
  name: string
  prefix: string
  fullKey: string
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    const res = await fetch("/api/api-keys")
    const body = await res.json()
    setKeys(body.data ?? [])
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCreateError(body.error || "Failed to create key")
        return
      }
      setJustCreated(body.data)
      setShowCreate(false)
      setCreateName("")
      load()
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Any client using it will start getting 401 immediately.`)) return
    const res = await fetch(`/api/api-keys/${id}/revoke`, { method: "POST" })
    if (res.ok) load()
  }

  async function copyToClipboard(s: string) {
    await navigator.clipboard.writeText(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-gray-600 mt-1">
            Bearer tokens for the REST API. See{" "}
            <a href="https://github.com/zenithventure/tinycal#api-documentation" target="_blank" rel="noreferrer"
              className="text-blue-600 hover:underline">API docs</a>.
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setJustCreated(null) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New API Key
        </button>
      </div>

      {justCreated && (
        <div className="mb-4 border-2 border-amber-300 bg-amber-50 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900">Save this key now — it will not be shown again</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {justCreated.name} · prefix {justCreated.prefix}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-xs font-mono break-all">
              {justCreated.fullKey}
            </code>
            <button onClick={() => copyToClipboard(justCreated.fullKey)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-2 rounded flex items-center gap-1.5">
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>
          <button onClick={() => setJustCreated(null)}
            className="text-xs text-amber-800 hover:underline mt-3">
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 mb-4">
          <label className="block text-sm font-medium mb-1">Name</label>
          <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
            placeholder="e.g. Mira concierge bot"
            required maxLength={80}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          {createError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-2">
              {createError}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-3">
            <button type="button" onClick={() => { setShowCreate(false); setCreateError(null) }}
              className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={creating || !createName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {keys === null ? (
          <div className="p-8 text-center text-gray-400 animate-pulse">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
            <KeyRound className="w-8 h-8 text-gray-300" />
            <div>No API keys yet</div>
          </div>
        ) : keys.map(k => (
          <div key={k.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{k.name}</span>
                {k.revokedAt && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Revoked</span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1 font-mono">
                tc_live_{k.prefix}…
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Created {fmtDate(k.createdAt)} · Last used {fmtDate(k.lastUsedAt)}
              </div>
            </div>
            {!k.revokedAt && (
              <button onClick={() => handleRevoke(k.id, k.name)}
                className="text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
