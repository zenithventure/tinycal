import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Soft-revoke an API key. Idempotent: re-revoking is a no-op. The row stays
// so historical lastUsedAt and per-key usage counters remain queryable.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: params.id },
    select: { userId: true, revokedAt: true },
  })
  if (!apiKey) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (apiKey.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!apiKey.revokedAt) {
    await prisma.apiKey.update({
      where: { id: params.id },
      data: { revokedAt: new Date() },
    })
  }

  return NextResponse.json({ success: true })
}
