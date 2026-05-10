import { NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { authenticateApiKey, isAuthFailure, applyAuthResponseHeaders } from "@/lib/api-keys/auth"
import { createBooking } from "@/lib/bookings/create"
import { hashRequestBody, lookupIdempotency, recordIdempotentResponse } from "@/lib/api-keys/idempotency"

export async function GET(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const bookings = await prisma.booking.findMany({
    where: {
      userId: auth.user.id,
      ...(status && { status: status as any }),
      ...(from && { startTime: { gte: new Date(from) } }),
      ...(to && { endTime: { lte: new Date(to) } }),
    },
    include: { eventType: { select: { title: true, slug: true } } },
    orderBy: { startTime: "desc" },
    take: 100,
  })
  return applyAuthResponseHeaders(NextResponse.json({ data: bookings }), auth)
}

const PostBodySchema = z.object({
  eventTypeId: z.string().min(1),
  startTime: z.string().datetime(),
  bookerName: z.string().min(1),
  bookerEmail: z.string().email(),
  bookerTimezone: z.string().min(1),
  bookerPhone: z.string().nullish(),
  answers: z.unknown().nullish(),
})

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req)
  if (isAuthFailure(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // ── Idempotency ──
  // Bot retry safety: if the same Idempotency-Key arrives twice with the same
  // body within 24h, return the cached response instead of re-executing.
  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || null
  const requestHash = idempotencyKey ? hashRequestBody(parsed.data) : null

  if (idempotencyKey && requestHash && auth.apiKeyId) {
    const lookup = await lookupIdempotency(auth.apiKeyId, idempotencyKey, requestHash)
    if (lookup.kind === "replay") {
      return applyAuthResponseHeaders(lookup.response, auth)
    }
    if (lookup.kind === "mismatch") {
      return applyAuthResponseHeaders(
        NextResponse.json(
          { error: "Idempotency-Key was previously used with a different request body" },
          { status: 409 }
        ),
        auth
      )
    }
    // miss → fall through and execute
  }

  const result = await createBooking({
    ...parsed.data,
    requireOwnerUserId: auth.user.id,
  })

  let responseStatus: number
  let responseBody: Record<string, unknown>
  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      EVENT_TYPE_NOT_FOUND: "Event type not found",
      FORBIDDEN: "Event type does not belong to this API key's owner",
      CONFLICT: "Time slot no longer available",
    }
    responseStatus = result.status
    responseBody = { error: messages[result.error] }
  } else {
    responseStatus = 201
    responseBody = { data: result.booking }
  }

  if (idempotencyKey && requestHash && auth.apiKeyId) {
    await recordIdempotentResponse({
      apiKeyId: auth.apiKeyId,
      idempotencyKey,
      requestHash,
      responseStatus,
      responseBody,
    })
  }

  return applyAuthResponseHeaders(
    NextResponse.json(responseBody, { status: responseStatus }),
    auth
  )
}
