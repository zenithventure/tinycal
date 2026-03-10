import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@tinycal.io"

export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { subject, message, category } = await req.json()

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 })
  }

  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
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
  </div>
  <div style="margin-top: 16px;">
    <p><strong>Message:</strong></p>
    <p style="white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
  </div>
</body>
</html>`,
    })

    // Send confirmation to user
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
    <p style="white-space: pre-wrap; margin: 4px 0;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
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
