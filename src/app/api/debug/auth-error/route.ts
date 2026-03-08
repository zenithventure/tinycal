import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const results: Record<string, any> = {}

  // 1. Env vars
  results.AUTH_SECRET_length = process.env.AUTH_SECRET
    ? `${process.env.AUTH_SECRET.length} chars`
    : "NOT SET"
  results.AUTH_URL = process.env.AUTH_URL ?? "NOT SET"
  results.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "NOT SET"

  // 2. Last auth error from logger (stored in globalThis)
  results.lastAuthError = (globalThis as any).__lastAuthError ?? "No error captured yet"

  // 3. Recent auth debug log
  results.authDebugLog = (globalThis as any).__authDebugLog ?? "No debug log yet"

  // 4. Last callback error from route wrapper
  results.lastCallbackError = (globalThis as any).__lastCallbackError ?? "No callback error captured"

  // 5. Google OIDC check
  try {
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration")
    const body = await res.json()
    results.googleOIDC = body.authorization_endpoint ? "OK" : "ERROR"
  } catch (error) {
    results.googleOIDC = `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }

  return NextResponse.json(results)
}
