import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

const SUPPORT_EMAILS = (process.env.SUPPORT_EMAIL || "support@tinycal.io")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean)

const MAX_FILES = 3
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per file

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

  // Process attachments
  const attachments: { filename: string; content: Buffer }[] = []
  for (let i = 0; i < MAX_FILES; i++) {
    const file = formData.get(`file${i}`) as File | null
    if (!file) continue
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File "${file.name}" exceeds 5MB limit` }, { status: 400 })
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: `File "${file.name}" is not an image` }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    attachments.push({ filename: file.name, content: buffer })
  }

  const escapedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;")

  try {
    await sendEmail({
      to: SUPPORT_EMAILS,
      subject: `[TinyCal Support] ${category ? `[${category}] ` : ""}${subject}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">New Support Ticket</h2>
  <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>From:</strong> ${user.name || "Unknown"} (${user.email})</p>
    <p style="margin: 4px 0;"><strong>Category:</strong> ${category || "General"}</p>
    <p style="margin: 4px 0;"><strong>Subject:</strong> ${subject}</p>
    ${attachments.length ? `<p style="margin: 4px 0;"><strong>Attachments:</strong> ${attachments.length} screenshot(s)</p>` : ""}
  </div>
  <div style="margin-top: 16px;">
    <p><strong>Message:</strong></p>
    <p style="white-space: pre-wrap;">${escapedMessage}</p>
  </div>
</body>
</html>`,
      attachments,
    })

    // Send confirmation to user (no attachments)
    await sendEmail({
      to: user.email,
      subject: `We received your support request: ${subject}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">We got your message</h2>
  <p>Hi ${user.name || "there"},</p>
  <p>Thanks for reaching out. We've received your support request and will get back to you as soon as possible.</p>
  <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Subject:</strong> ${subject}</p>
    <p style="margin: 4px 0;"><strong>Message:</strong></p>
    <p style="white-space: pre-wrap; margin: 4px 0;">${escapedMessage}</p>
  </div>
  <p style="color: #666; font-size: 14px;">— The TinyCal Team</p>
</body>
</html>`,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Support email failed:", e)
    return NextResponse.json({ error: "Failed to send support request" }, { status: 500 })
  }
}
