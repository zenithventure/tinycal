import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyUnsubscribeToken } from "@/lib/email-service"

export const dynamic = "force-dynamic"

function confirmPage(token: string, invalid: boolean): string {
  const action = "/unsubscribe/" + token
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Unsubscribe — TinyCal</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px; color: #1a1a1a;">
  ${
    invalid
      ? '<h1 style="font-size: 18px; font-weight: 600;">Invalid or expired link</h1><p>This unsubscribe link is not valid. If you expected to unsubscribe, reply to the latest announcement email.</p>'
      : '<h1 style="font-size: 18px; font-weight: 600;">Unsubscribe from release announcements?</h1><p>You will stop receiving TinyCal release announcement emails. Booking and meeting emails are not affected.</p>'
  }
  ${
    invalid
      ? ""
      : '<form action="' + action + '" method="post" style="margin-top: 20px;"><button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:14px;cursor:pointer;">Unsubscribe</button></form>'
  }
</body></html>`
}

// GET renders a safe confirmation page and has NO side effects, so mail-client
// prefetching of the email link cannot unsubscribe anyone.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const userId = verifyUnsubscribeToken(params.token)
  const html = confirmPage(`${encodeURIComponent(params.token)}`, !userId)
  return new Response(html, {
    status: userId ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

// The actual unsubscribe is a POST, only fired by the button on the page above.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const userId = verifyUnsubscribeToken(params.token)
  if (!userId) return NextResponse.redirect(new URL("/unsubscribed?status=invalid", base), { status: 303 })

  await prisma.user.updateMany({ where: { id: userId }, data: { emailOptOut: true } })
  return NextResponse.redirect(new URL("/unsubscribed", base), { status: 303 })
}
