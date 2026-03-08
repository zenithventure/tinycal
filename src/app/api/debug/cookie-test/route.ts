import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const step = url.searchParams.get("step")

  if (step === "check") {
    // Step 2: Check if cookies survived the redirect
    const testCookie = req.cookies.get("debug-cookie-test")
    const secureCookie = req.cookies.get("__Secure-debug-test")
    const allCookies = req.cookies.getAll().map(c => `${c.name}=${c.value.substring(0, 20)}...`)

    return NextResponse.json({
      testCookieFound: !!testCookie,
      testCookieValue: testCookie?.value ?? "NOT FOUND",
      secureCookieFound: !!secureCookie,
      secureCookieValue: secureCookie?.value ?? "NOT FOUND",
      allCookies,
      headers: Object.fromEntries(req.headers.entries()),
    })
  }

  // Step 1: Set cookies and redirect back to step=check
  const checkUrl = new URL(req.url)
  checkUrl.searchParams.set("step", "check")

  const response = NextResponse.redirect(checkUrl)

  // Regular cookie (like sameSite: lax)
  response.cookies.set("debug-cookie-test", "cookie-works-" + Date.now(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 300,
  })

  // __Secure- prefixed cookie (like Auth.js uses on HTTPS)
  response.cookies.set("__Secure-debug-test", "secure-cookie-works-" + Date.now(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: 300,
  })

  return response
}
