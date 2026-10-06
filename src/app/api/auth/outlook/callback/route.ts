import { NextResponse } from "next/server"
import { encryptToken } from "@/lib/calendar/tokens"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=no_code`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`,
        grant_type: "authorization_code",
        scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access User.Read",
      }),
    }
  )

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=token_exchange`)
  }

  const tokens = await tokenRes.json()

  // Get user email from Graph
  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json()

  await prisma.calendarConnection.upsert({
    where: {
      userId_provider_email: {
        userId: user.id,
        provider: "OUTLOOK",
        email: profile.mail || profile.userPrincipalName,
      },
    },
    update: {
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    create: {
      userId: user.id,
      provider: "OUTLOOK",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: profile.mail || profile.userPrincipalName,
    },
  })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?calendar=connected`)
}
