import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  // Return user with calendar connections
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, name: true, email: true, image: true, timezone: true,
      plan: true, slug: true, brandColor: true, brandLogo: true,
      stripeCurrentPeriodEnd: true,
      calendarConnections: {
        select: {
          id: true, provider: true, email: true,
          isPrimary: true, checkConflicts: true, label: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  return NextResponse.json(fullUser)
}

export async function PATCH(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name,
      timezone: body.timezone,
      slug: body.slug,
      brandColor: body.brandColor,
      brandLogo: body.brandLogo,
    },
  })
  return NextResponse.json(updated)
}
