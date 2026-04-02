import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

// TD-0002: support route verified
const TINYDESK_URL = process.env.TINYDESK_URL || "https://tinydesk.zenithstudio.app"

const MAX_FILES = 3
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per file
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const subject = formData.get("subject") as string
  const message = formData.get("message") as string
  const category = formData.get("category") as string

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 })
  }

  // Collect and validate files
  const files: File[] = []
  for (let i = 0; i < MAX_FILES; i++) {
    const file = formData.get(`file${i}`) as File | null
    if (!file) continue
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File "${file.name}" exceeds 5MB limit` }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `File "${file.name}" is not a supported image type` }, { status: 400 })
    }
    files.push(file)
  }

  try {
    // Upload screenshots to TinyDesk if any
    let screenshots: string[] | undefined
    if (files.length > 0) {
      const uploadForm = new FormData()
      files.forEach((f) => uploadForm.append("files", f))

      const uploadRes = await fetch(`${TINYDESK_URL}/api/tickets/upload`, {
        method: "POST",
        body: uploadForm,
      })

      if (!uploadRes.ok) {
        console.error("TinyDesk screenshot upload failed:", uploadRes.status)
        // Screenshots are optional — degrade gracefully instead of failing the whole submission
      } else {
        try {
          const uploadData = await uploadRes.json()
          screenshots = uploadData.urls
        } catch (e) {
          console.error("TinyDesk screenshot upload response was malformed:", e)
          // Treat as upload failure — continue without screenshots
        }
      }
    }

    // Create ticket
    const body = category
      ? `[${category}]\n\n${message}`
      : message

    const res = await fetch(`${TINYDESK_URL}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSlug: "tinycal",
        submitterEmail: user.email,
        submitterName: user.name || undefined,
        subject,
        body,
        screenshots,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error("TinyDesk ticket creation failed:", res.status, data)
      return NextResponse.json(
        { error: "Failed to submit support ticket" },
        { status: 502 }
      )
    }

    const ticket = await res.json()

    return NextResponse.json({
      ok: true,
      ticketId: ticket.publicId,
      trackingUrl: `${TINYDESK_URL}/ticket/${ticket.publicId}`,
    })
  } catch (e) {
    console.error("Support ticket submission failed:", e)
    return NextResponse.json({ error: "Failed to submit support ticket" }, { status: 500 })
  }
}
