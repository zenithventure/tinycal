import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const env = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "NOT SET",
    AUTH_SECRET: process.env.AUTH_SECRET ? "SET (hidden)" : "NOT SET",
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "NOT SET",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 10) + "..." : "NOT SET",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "SET (hidden)" : "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + "..." : "NOT SET",
    NODE_ENV: process.env.NODE_ENV ?? "NOT SET",
  }

  let db = "UNTESTED"
  try {
    const count = await prisma.user.count()
    db = `OK (${count} users)`
  } catch (error) {
    db = `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }

  return NextResponse.json({ ...env, database: db })
}
