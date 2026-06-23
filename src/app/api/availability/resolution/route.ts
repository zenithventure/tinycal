import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { getAvailabilityResolutionSummary } from "@/lib/availability"

// Dashboard-only: tells the UI which source (event-type schedule, user-default
// schedule, or legacy Availability) actually wins for each event type, so the
// editor can explain *why* a legacy rule change isn't moving slots. See #75.
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const summary = await getAvailabilityResolutionSummary(user.id)
  return NextResponse.json(summary)
}
