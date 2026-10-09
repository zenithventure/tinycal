import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// Single enforcement point for FREE vs PRO plan gating (#99).
// Call sites must go through requirePro()/enforceEventTypeLimit() and convert
// the thrown PlanGateError with planGateResponse() — never compare
// `user.plan` inline.

export type ProFeature = "paid_event_types" | "unlimited_event_types"

export const FREE_EVENT_TYPE_LIMIT = 1

const FEATURE_MESSAGES: Record<ProFeature, string> = {
  paid_event_types: "Collecting payment on event types is a Pro feature. Upgrade to Pro.",
  unlimited_event_types: `Free plan limited to ${FREE_EVENT_TYPE_LIMIT} event type. Upgrade to Pro.`,
}

// 402 Payment Required: the request is valid but needs a paid plan.
export class PlanGateError extends Error {
  readonly status = 402
  readonly code = "PRO_REQUIRED"
  constructor(readonly feature: ProFeature) {
    super(FEATURE_MESSAGES[feature])
    this.name = "PlanGateError"
  }
}

export function isPro(user: { plan?: string | null }): boolean {
  return user.plan === "PRO"
}

export function requirePro(user: { plan?: string | null }, feature: ProFeature): void {
  if (!isPro(user)) throw new PlanGateError(feature)
}

// FREE users may own at most FREE_EVENT_TYPE_LIMIT event types.
export async function enforceEventTypeLimit(user: { id: string; plan?: string | null }): Promise<void> {
  if (isPro(user)) return
  const count = await prisma.eventType.count({ where: { userId: user.id } })
  if (count >= FREE_EVENT_TYPE_LIMIT) requirePro(user, "unlimited_event_types")
}

// Returns a 402 response for a PlanGateError, or null for any other error.
export function planGateResponse(e: unknown): NextResponse | null {
  if (!(e instanceof PlanGateError)) return null
  return NextResponse.json({ error: e.message, code: e.code, feature: e.feature }, { status: e.status })
}
