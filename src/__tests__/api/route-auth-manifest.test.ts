// Guardrail: every handler under src/app/api/** must declare its auth class
// here. Adding a route (or an exported method) without classifying it fails
// this test. Keep docs/api-route-auth.md in sync with this manifest.
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

type AuthClass = "PUBLIC" | "SESSION" | "API_KEY" | "CRON"
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

const SESSION = "SESSION" as const
const PUBLIC = "PUBLIC" as const
const API_KEY = "API_KEY" as const
const CRON = "CRON" as const

// Marker that must appear inside the handler body for each non-PUBLIC class.
const MARKERS: Record<Exclude<AuthClass, "PUBLIC">, RegExp> = {
  SESSION: /getAuthenticatedUser\(/,
  API_KEY: /authenticateApiKey\(/,
  CRON: /isAuthorizedCronRequest\(/,
}

const all = (m: Method[], c: AuthClass) => Object.fromEntries(m.map((x) => [x, c])) as Partial<Record<Method, AuthClass>>

// route dir (relative to src/app/api) -> method -> class
const MANIFEST: Record<string, Partial<Record<Method, AuthClass>>> = {
  "api-keys": all(["GET", "POST"], SESSION),
  "api-keys/[id]/revoke": all(["POST"], SESSION),
  // Auth.js handlers (login/session/csrf endpoints) — public by design.
  "auth/[...nextauth]": all(["GET", "POST"], PUBLIC),
  "auth/google": all(["GET"], SESSION),
  "auth/google/callback": all(["GET"], SESSION),
  "auth/outlook": all(["GET"], SESSION),
  "auth/outlook/callback": all(["GET"], SESSION),
  availability: all(["GET", "PUT"], SESSION),
  "availability/schedules": all(["GET", "POST"], SESSION),
  "availability/schedules/[id]": all(["GET", "PUT", "DELETE"], SESSION),
  // Booker-facing; the unguessable booking uid is the capability.
  "bookings/[uid]": all(["GET"], PUBLIC),
  "bookings/[uid]/cancel": all(["POST"], PUBLIC),
  "bookings/[uid]/reschedule": all(["POST"], PUBLIC),
  bookings: { GET: SESSION, POST: PUBLIC },
  "calendar-connections/[id]": all(["PATCH", "DELETE"], SESSION),
  contacts: all(["GET"], SESSION),
  "cron/calendar-sync": all(["GET"], CRON),
  "cron/reminders": all(["GET"], CRON),
  "cron/webhook-retries": all(["GET"], CRON),
  "event-types": all(["GET", "POST"], SESSION),
  "event-types/[id]": all(["GET", "PATCH", "DELETE"], SESSION),
  "meeting-links": all(["POST"], SESSION),
  "meeting-links/[uid]": all(["GET"], PUBLIC),
  "meeting-links/[uid]/confirm": all(["POST"], PUBLIC),
  "meeting-links/[uid]/ics": all(["GET"], PUBLIC),
  slots: all(["GET"], PUBLIC),
  "stripe/booking-payment": all(["POST"], PUBLIC),
  "stripe/checkout": all(["POST"], SESSION),
  "stripe/portal": all(["POST"], SESSION),
  // Verified by Stripe signature (constructEvent) — see WEBHOOK_SIGNATURE check below.
  "stripe/webhook": all(["POST"], PUBLIC),
  support: all(["POST"], SESSION),
  user: all(["GET", "PATCH"], SESSION),
  "users/lookup": all(["GET"], SESSION),
  "v1/bookings": all(["GET", "POST"], API_KEY),
  "v1/event-types": all(["GET", "POST"], API_KEY),
  webhooks: all(["GET", "POST", "DELETE"], SESSION),
}

const API_DIR = path.resolve(__dirname, "../../app/api")
const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

function findRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return findRouteFiles(p)
    return e.name === "route.ts" ? [p] : []
  })
}

const routes = findRouteFiles(API_DIR)
  .map((f) => ({ file: f, key: path.relative(API_DIR, path.dirname(f)).split(path.sep).join("/") }))
  .sort((a, b) => a.key.localeCompare(b.key))

// Returns the source of each handler, keyed by method. Handles both
// `export async function GET` and `export const { GET, POST } = handlers`.
function handlerBodies(src: string): Partial<Record<Method, string>> {
  const out: Partial<Record<Method, string>> = {}
  const starts: { m: Method; i: number }[] = []
  for (const m of METHODS) {
    const fn = new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).exec(src)
    const re = new RegExp(`export\\s+const\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`).exec(src)
    const hit = fn ?? re
    if (hit) starts.push({ m, i: hit.index })
  }
  starts.sort((a, b) => a.i - b.i)
  starts.forEach((s, n) => {
    out[s.m] = src.slice(s.i, starts[n + 1]?.i ?? src.length)
  })
  return out
}

function readAllowList(): string[] {
  const src = fs.readFileSync(path.resolve(__dirname, "../../middleware.ts"), "utf8")
  const block = /const publicRoutes = \[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error("publicRoutes allow-list not found in middleware.ts")
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const allowList = readAllowList()
const isAllowListed = (p: string) => allowList.some((r) => p === r || p.startsWith(r + "/"))
// Static URL path for a route dir; dynamic segments become a placeholder.
const urlPath = (key: string) => "/api/" + key.replace(/\[[^\]]+\]/g, "x")

describe("API route auth manifest", () => {
  it("finds route files", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("classifies every route and exported method (and nothing stale)", () => {
    const actual = Object.fromEntries(
      routes.map((r) => [r.key, Object.keys(handlerBodies(fs.readFileSync(r.file, "utf8"))).sort()])
    )
    const declared = Object.fromEntries(
      Object.entries(MANIFEST).map(([k, v]) => [k, Object.keys(v).sort()])
    )
    expect(actual).toEqual(declared)
  })

  describe.each(routes)("$key", ({ file, key }) => {
    const src = fs.readFileSync(file, "utf8")
    const bodies = handlerBodies(src)
    const classes = MANIFEST[key] ?? {}
    const listed = isAllowListed(urlPath(key))

    for (const m of METHODS.filter((x) => classes[x])) {
      const cls = classes[m]!
      if (listed) {
        it(`${m}: allow-listed in middleware, so it must self-authenticate or be declared PUBLIC`, () => {
          if (cls === "PUBLIC") return
          expect(bodies[m]).toMatch(MARKERS[cls])
        })
      } else {
        it(`${m}: not allow-listed, so middleware enforces the session (class must be SESSION)`, () => {
          expect(cls).toBe("SESSION")
        })
      }
    }
  })

  it("stripe webhook verifies the Stripe signature", () => {
    const src = fs.readFileSync(path.join(API_DIR, "stripe/webhook/route.ts"), "utf8")
    expect(src).toMatch(/constructEvent\(/)
  })

  it("every allow-list entry under /api matches at least one route", () => {
    for (const entry of allowList.filter((e) => e.startsWith("/api"))) {
      const matches = routes.some((r) => {
        const u = urlPath(r.key)
        return u === entry || u.startsWith(entry + "/")
      })
      expect(matches, `stale middleware allow-list entry ${entry}`).toBe(true)
    }
  })
})
