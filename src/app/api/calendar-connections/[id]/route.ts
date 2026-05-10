/**
 * @module calendar-connections/[id]
 *
 * API routes for managing individual calendar connections.
 * Supports updating connection settings (PATCH) and disconnecting calendars (DELETE).
 *
 * All endpoints require authentication and verify ownership of the connection.
 *
 * @see {@link file://src/lib/calendar/conflict-detection.ts} for the conflict detection service
 */
import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * Updates a calendar connection's settings.
 *
 * Supports updating:
 * - `label` - Custom display name for the calendar
 * - `checkConflicts` - Whether to check this calendar for scheduling conflicts
 * - `isPrimary` - Whether this is the primary calendar for creating new events
 *
 * Business rules:
 * - At least one calendar must always have `checkConflicts` enabled
 * - Setting `isPrimary: true` automatically unsets the previous primary calendar
 *
 * @route PATCH /api/calendar-connections/:id
 * @auth Required - session-based authentication
 *
 * @param req.body.label - Optional custom label for the calendar
 * @param req.body.checkConflicts - Optional boolean to toggle conflict checking
 * @param req.body.isPrimary - Optional boolean to set as primary calendar
 *
 * @returns 200 - Updated CalendarConnection object
 * @returns 400 - Validation error (e.g., disabling last conflict-checking calendar)
 * @returns 401 - Not authenticated or connection belongs to another user
 * @returns 404 - Calendar connection not found
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const { id } = params

  // Verify the calendar connection exists and belongs to the user
  const connection = await prisma.calendarConnection.findUnique({ where: { id } })
  if (!connection) {
    return NextResponse.json({ error: "Calendar connection not found" }, { status: 404 })
  }
  if (connection.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { label, checkConflicts, isPrimary } = body

  // Validate: cannot disable checkConflicts on the only calendar that has it enabled
  if (checkConflicts === false) {
    const otherCheckingCalendars = await prisma.calendarConnection.count({
      where: {
        userId,
        id: { not: id },
        checkConflicts: true,
      },
    })
    if (otherCheckingCalendars === 0) {
      return NextResponse.json(
        { error: "Cannot disable conflict checking on the only calendar with it enabled. At least one calendar must check for conflicts." },
        { status: 400 }
      )
    }
  }

  // If setting as primary, unset the current primary first
  if (isPrimary === true) {
    await prisma.calendarConnection.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const updated = await prisma.calendarConnection.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(checkConflicts !== undefined && { checkConflicts }),
      ...(isPrimary !== undefined && { isPrimary }),
    },
  })

  return NextResponse.json(updated)
}

/**
 * Disconnects (deletes) a calendar connection.
 *
 * Business rules:
 * - Users cannot disconnect their last remaining calendar
 * - If the deleted calendar was the primary, the oldest remaining calendar
 *   is automatically promoted to primary
 *
 * @route DELETE /api/calendar-connections/:id
 * @auth Required - session-based authentication
 *
 * @returns 200 - `{ success: true }`
 * @returns 400 - Cannot disconnect last calendar
 * @returns 401 - Not authenticated or connection belongs to another user
 * @returns 404 - Calendar connection not found
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const { id } = params

  // Verify the calendar connection exists and belongs to the user
  const connection = await prisma.calendarConnection.findUnique({ where: { id } })
  if (!connection) {
    return NextResponse.json({ error: "Calendar connection not found" }, { status: 404 })
  }
  if (connection.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Cannot disconnect the last calendar
  const totalCalendars = await prisma.calendarConnection.count({ where: { userId } })
  if (totalCalendars <= 1) {
    return NextResponse.json(
      { error: "Cannot disconnect the last calendar. You must have at least one connected calendar." },
      { status: 400 }
    )
  }

  await prisma.calendarConnection.delete({ where: { id } })

  // If the deleted calendar was primary, set another one as primary
  if (connection.isPrimary) {
    const nextPrimary = await prisma.calendarConnection.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    })
    if (nextPrimary) {
      await prisma.calendarConnection.update({
        where: { id: nextPrimary.id },
        data: { isPrimary: true },
      })
    }
  }

  return NextResponse.json({ success: true })
}
