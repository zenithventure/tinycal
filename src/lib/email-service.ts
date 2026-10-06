import { createHmac, timingSafeEqual } from "crypto"
import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { changelogEntries, type ChangelogEntry } from "@/lib/changelog"

// --- Unsubscribe tokens: `<userId>.<hmac>` signed with AUTH_SECRET ----------

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim()
  if (!s) throw new Error("AUTH_SECRET is required to sign unsubscribe tokens")
  return s
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest("base64url")
}

export function createUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId)}`
}

/** Returns the user id when the token signature is valid, otherwise null. */
export function verifyUnsubscribeToken(token: string): string | null {
  const idx = token.lastIndexOf(".")
  if (idx <= 0) return null
  const userId = token.slice(0, idx)
  const given = Buffer.from(token.slice(idx + 1))
  const expected = Buffer.from(sign(userId))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return userId
}

export function unsubscribeUrl(userId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  return `${base}/unsubscribe/${encodeURIComponent(createUnsubscribeToken(userId))}`
}

// --- Email body -------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function releaseAnnouncementEmail(entry: ChangelogEntry, unsubscribe: string): string {
  const changes = (entry.changes ?? [])
    .map((c) => `<li style="margin: 6px 0;"><strong>${esc(c.type)}</strong>: ${esc(c.text)}</li>`)
    .join("")
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #2563eb;">${esc(entry.title)}</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #666;">${esc(entry.date)}</p>
  </div>
  <p>${esc(entry.description)}</p>
  ${changes ? `<ul style="padding-left: 20px;">${changes}</ul>` : ""}
  <p><a href="${base}/changelog">See the full changelog</a></p>
  <p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    <a href="${unsubscribe}" style="color: #ef4444;">Unsubscribe</a> from release announcements.
    You are receiving this because you have a TinyCal account.
  </p>
</body>
</html>`
}

// --- Sending ----------------------------------------------------------------

export interface AnnouncementResult {
  dryRun: boolean
  recipients: number
  sent: number
  failed: number
  sample?: { id: string; email: string }
}

export function latestChangelogEntry(): ChangelogEntry | null {
  return changelogEntries[0] ?? null
}

export async function sendReleaseAnnouncement(
  entry: ChangelogEntry,
  opts: { dryRun?: boolean } = {}
): Promise<AnnouncementResult> {
  const dryRun = !!opts.dryRun
  // Null emailOptOut means "never opted out"; only an explicit true skips.
  const users = await prisma.user.findMany({
    where: { email: { not: null }, NOT: { emailOptOut: true } },
    select: { id: true, email: true },
  })
  const recipients = users.filter((u): u is { id: string; email: string } => !!u.email)
  const result: AnnouncementResult = {
    dryRun,
    recipients: recipients.length,
    sent: 0,
    failed: 0,
    sample: recipients[0],
  }
  if (dryRun) return result

  const subject = `What's new in TinyCal: ${entry.title}`
  for (const u of recipients) {
    try {
      await sendEmail({ to: u.email, subject, html: releaseAnnouncementEmail(entry, unsubscribeUrl(u.id)) })
      result.sent++
    } catch (err) {
      result.failed++
      console.error(`Announcement failed for user ${u.id}:`, err)
    }
  }
  return result
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}
