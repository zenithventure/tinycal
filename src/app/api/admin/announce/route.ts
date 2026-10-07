import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { isAdminEmail, latestChangelogEntry, sendReleaseAnnouncement } from "@/lib/email-service"

export const dynamic = "force-dynamic"

async function requireAdmin() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

/** Admin check + latest entry preview. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json({ entry: latestChangelogEntry() })
}

/** Body: { dryRun?: boolean }. Sends the latest changelog entry to all non-opted-out users. */
export async function POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const entry = latestChangelogEntry()
  if (!entry) return NextResponse.json({ error: "No changelog entries" }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const result = await sendReleaseAnnouncement(entry, { dryRun: body?.dryRun !== false })
  return NextResponse.json(result)
}
