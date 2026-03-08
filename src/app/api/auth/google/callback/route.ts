import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state") // userId
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=GoogleAuthFailed", process.env.NEXT_PUBLIC_APP_URL!))
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    })

    const tokens = await tokenResponse.json()

    if (!tokens.access_token) {
      throw new Error("No access token received")
    }

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoResponse.json()

    // Check if user already has a primary calendar
    const existingPrimary = await prisma.calendarConnection.findFirst({
      where: { userId: state, isPrimary: true },
    })

    // Save calendar connection
    await prisma.calendarConnection.upsert({
      where: {
        userId_provider_email: {
          userId: state,
          provider: "GOOGLE",
          email: userInfo.email,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      },
      create: {
        userId: state,
        provider: "GOOGLE",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        email: userInfo.email,
        isPrimary: !existingPrimary, // Only set as primary if no existing primary
      },
    })

    return NextResponse.redirect(new URL("/dashboard/settings?success=GoogleConnected", process.env.NEXT_PUBLIC_APP_URL!))
  } catch (error) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(new URL("/dashboard/settings?error=GoogleAuthFailed", process.env.NEXT_PUBLIC_APP_URL!))
  }
}
