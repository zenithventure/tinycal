import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Resolves an email address to a public user summary (id, name, email).
// Used by the event-type editor to pick a co-host for collective scheduling
// (#42). Session-auth required so we don't expose a user-existence oracle to
// anonymous callers. Even authed users only get back name/email — no other
// account fields.
export async function GET(req: Request) {
  const requester = await getAuthenticatedUser()
  if (!requester) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "email query parameter required" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  })

  if (!user) {
    return NextResponse.json(
      { error: "No TinyCal user found for that email — they need to sign up + connect a calendar first" },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: user })
}
