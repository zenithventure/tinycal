import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateApiKey } from "@/lib/api-keys/generate"

// List the current user's API keys (no secrets returned).
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ data: keys })
}

// Mint a new API key. The full secret is returned exactly ONCE in this
// response — never retrievable later, only the prefix + sha256(secret) hash
// persist.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "name must be 80 chars or fewer" }, { status: 400 })
  }

  const { fullKey, prefix, hashedSecret } = generateApiKey()

  const apiKey = await prisma.apiKey.create({
    data: { userId: user.id, prefix, hashedSecret, name, scopes: [] },
    select: {
      id: true, name: true, prefix: true, createdAt: true,
    },
  })

  return NextResponse.json(
    { data: { ...apiKey, fullKey } },
    { status: 201 }
  )
}
