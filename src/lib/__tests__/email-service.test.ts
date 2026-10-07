import { describe, it, expect, vi, beforeEach } from "vitest"

const { findMany, updateMany, sendEmail } = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ default: { user: { findMany, updateMany } } }))
vi.mock("@/lib/email", () => ({ sendEmail }))

import { sendReleaseAnnouncement, createUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email-service"
import { POST as unsubscribe } from "@/app/unsubscribe/[token]/route"

const entry = { id: "e", date: "2026-10-06", title: "1.0 <Hardening>", description: "d", type: "new" as const }

// Emulates the Prisma filter so the opt-out rule is actually exercised.
const users = [
  { id: "a", email: "a@x.com", emailOptOut: null },
  { id: "b", email: "b@x.com", emailOptOut: false },
  { id: "c", email: "c@x.com", emailOptOut: true },
  { id: "d", email: null, emailOptOut: null },
]
function applyWhere() {
  findMany.mockImplementation(async ({ where }) => {
    expect(where).toEqual({ email: { not: null }, NOT: { emailOptOut: true } })
    return users.filter((u) => u.email !== null && u.emailOptOut !== true)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_SECRET = "test-secret"
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test"
  applyWhere()
})

describe("sendReleaseAnnouncement", () => {
  it("skips opted-out users and users without email", async () => {
    const r = await sendReleaseAnnouncement(entry)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(["a@x.com", "b@x.com"])
    expect(r).toMatchObject({ recipients: 2, sent: 2, failed: 0 })
  })

  it("includes an unsubscribe link and escapes entry text", async () => {
    await sendReleaseAnnouncement(entry)
    const html: string = sendEmail.mock.calls[0][0].html
    expect(html).toContain(`https://app.test/unsubscribe/${encodeURIComponent(createUnsubscribeToken("a"))}`)
    expect(html).toContain("1.0 &lt;Hardening&gt;")
  })

  it("dry run reports count and sample without calling Resend", async () => {
    const r = await sendReleaseAnnouncement(entry, { dryRun: true })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(r).toMatchObject({ dryRun: true, recipients: 2, sent: 0, sample: { id: "a", email: "a@x.com" } })
  })

  it("counts failures and keeps sending", async () => {
    sendEmail.mockRejectedValueOnce(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await sendReleaseAnnouncement(entry)
    expect(r).toMatchObject({ sent: 1, failed: 1 })
  })
})

describe("unsubscribe tokens + route", () => {
  it("rejects tampered tokens", () => {
    const t = createUnsubscribeToken("user1")
    expect(verifyUnsubscribeToken(t)).toBe("user1")
    expect(verifyUnsubscribeToken("user2." + t.split(".")[1])).toBeNull()
    expect(verifyUnsubscribeToken("garbage")).toBeNull()
  })

  it("sets emailOptOut and redirects for a valid token (POST)", async () => {
    const token = encodeURIComponent(createUnsubscribeToken("user1"))
    const res = await unsubscribe(new Request("https://app.test/unsubscribe/x"), { params: { token } })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "user1" }, data: { emailOptOut: true } })
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://app.test/unsubscribed")
  })

  it("does not touch the DB for an invalid token", async () => {
    const res = await unsubscribe(new Request("https://app.test/unsubscribe/x"), { params: { token: "user1.bad" } })
    expect(updateMany).not.toHaveBeenCalled()
    expect(res.headers.get("location")).toContain("status=invalid")
  })
})
