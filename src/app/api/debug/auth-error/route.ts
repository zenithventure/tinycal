import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// This endpoint attempts to diagnose Auth.js configuration issues
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000"

  const results: Record<string, string> = {}

  // 1. Check if AUTH_SECRET is valid
  results.AUTH_SECRET_length = process.env.AUTH_SECRET
    ? `${process.env.AUTH_SECRET.length} chars`
    : "NOT SET"

  // 2. Check AUTH_URL vs NEXTAUTH_URL
  results.AUTH_URL = process.env.AUTH_URL ?? "NOT SET"
  results.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "NOT SET"

  // 3. Try to manually simulate the callback to see what error Auth.js throws
  try {
    // Hit the callback endpoint with a fake code to trigger the error path
    const callbackUrl = `${baseUrl}/api/auth/callback/google?code=fake_test_code&state=fake_state`
    const res = await fetch(callbackUrl, {
      redirect: "manual", // Don't follow redirects
      headers: {
        // No cookies - this will trigger the real error
        "User-Agent": "debug-test",
      },
    })
    const location = res.headers.get("location") || "none"
    results.callbackTest = `status=${res.status}, location=${location}`

    // If it redirected to an error page, extract the error
    if (location.includes("error=")) {
      const errorMatch = location.match(/error=([^&]+)/)
      results.callbackError = errorMatch ? decodeURIComponent(errorMatch[1]) : "unknown"
    }
  } catch (error) {
    results.callbackTest = `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }

  // 4. Check if the Google OAuth well-known config is accessible
  try {
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration")
    const body = await res.json()
    results.googleOIDC = body.authorization_endpoint ? "OK" : "ERROR: unexpected response"
  } catch (error) {
    results.googleOIDC = `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }

  // 5. Try importing and testing auth config
  try {
    const { auth } = await import("@/auth")
    results.authImport = "OK"
  } catch (error) {
    results.authImport = `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }

  return NextResponse.json(results)
}
