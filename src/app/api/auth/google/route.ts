import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL!))
  }

  // Least-privilege scopes: identity (openid/email/profile) plus calendar.events,
  // which is enough to read conflict events and create/update/delete booking events.
  // Avoid the broader `auth/calendar` scope — it grants full calendar management
  // (including deleting calendars) and triggers Google's "unverified app" warning
  // with a scarier permission prompt than we need.
  const scope = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ")

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: user.id, // Pass user ID in state
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
