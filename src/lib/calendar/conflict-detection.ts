/**
 * @module conflict-detection
 *
 * Multi-calendar conflict detection service for TinyCal.
 *
 * This module aggregates busy events from all of a user's connected calendars
 * (Google Calendar and Outlook) that have conflict checking enabled. It is the
 * core component used by the availability engine to prevent double-booking
 * across multiple calendar accounts.
 *
 * Architecture:
 * - Queries only calendars where `checkConflicts` is `true`
 * - Fetches events from all providers in parallel using `Promise.allSettled`
 * - Caches results in memory for 5 minutes to reduce API calls
 * - Handles token refresh transparently for both Google and Outlook
 * - Fails gracefully: if one calendar fails, events from others are still returned
 */
import prisma from "../prisma"
import { fetchGoogleCalendarEvents, refreshGoogleToken } from "./google-calendar"
import type { CalendarEvent } from "./google-calendar"

export type { CalendarEvent }

/**
 * In-memory cache for fetched calendar events.
 * Key format: `${userId}:${startDate.toISOString()}:${endDate.toISOString()}`
 * This avoids redundant API calls when the same date range is checked
 * multiple times within the TTL window (e.g., when a booking page loads
 * available slots for the same month).
 */
const eventCache = new Map<
  string,
  { events: CalendarEvent[]; expiresAt: number }
>()

/** Cache entries expire after 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Fetches and merges busy events from all of a user's connected calendars
 * that have conflict checking enabled.
 *
 * This is the primary entry point for the conflict detection system. The
 * availability engine calls this to determine which time slots are blocked
 * across all connected calendars.
 *
 * Results are cached in memory for 5 minutes to reduce external API calls.
 * Use {@link clearEventCache} to invalidate the cache when calendar
 * connections are modified.
 *
 * @param userId - The ID of the user whose calendars to check
 * @param startDate - Start of the date range to check (inclusive)
 * @param endDate - End of the date range to check (exclusive)
 * @param eventTypeId - Optional event type ID (reserved for future per-event-type rules)
 * @returns Merged array of {@link CalendarEvent} from all conflict-checked calendars.
 *          Returns an empty array if no calendars have conflict checking enabled.
 *
 * @example
 * ```ts
 * const busyEvents = await getConflictingEvents(
 *   userId,
 *   new Date("2026-02-01"),
 *   new Date("2026-02-28")
 * )
 * // busyEvents contains events from Google + Outlook calendars
 * // where checkConflicts is enabled
 * ```
 */
export async function getConflictingEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
  _eventTypeId?: string
): Promise<CalendarEvent[]> {
  const cacheKey = `${userId}:${startDate.toISOString()}:${endDate.toISOString()}`
  const cached = eventCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.events
  }

  // Fetch all calendar connections where conflict checking is enabled
  const connections = await prisma.calendarConnection.findMany({
    where: {
      userId,
      checkConflicts: true,
    },
  })

  if (connections.length === 0) return []

  // Fetch events from all calendars in parallel
  const results = await Promise.allSettled(
    connections.map((connection) => fetchEventsForConnection(connection, startDate, endDate))
  )

  // Merge all successful results, log failures
  const allEvents: CalendarEvent[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "fulfilled") {
      allEvents.push(...result.value)
    } else {
      console.error(
        `Failed to fetch events for calendar connection ${connections[i].id} (${connections[i].provider}):`,
        result.reason
      )
    }
  }

  // Cache the results
  eventCache.set(cacheKey, {
    events: allEvents,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return allEvents
}

/**
 * Dispatches event fetching to the appropriate provider-specific handler
 * based on the connection's `provider` field.
 *
 * @param connection - The calendar connection details including tokens
 * @param startDate - Start of the date range to query
 * @param endDate - End of the date range to query
 * @returns Events from the specified calendar, or empty array for unknown providers
 */
async function fetchEventsForConnection(
  connection: {
    id: string
    provider: string
    accessToken: string
    refreshToken: string | null
    expiresAt: Date | null
  },
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  switch (connection.provider) {
    case "GOOGLE":
      return fetchGoogleEvents(connection, startDate, endDate)
    case "OUTLOOK":
      return fetchOutlookEvents(connection, startDate, endDate)
    default:
      console.warn(`Unknown calendar provider: ${connection.provider}`)
      return []
  }
}

/**
 * Fetches events from a Google Calendar connection.
 *
 * Proactively refreshes the access token if it has expired before making
 * the API call. Persists refreshed tokens back to the database. If the
 * proactive refresh fails, attempts the request with the existing token
 * anyway (the underlying fetcher has its own retry logic).
 *
 * @param connection - Google calendar connection with OAuth tokens
 * @param startDate - Start of the date range to query
 * @param endDate - End of the date range to query
 * @returns Array of calendar events from the Google Calendar
 */
async function fetchGoogleEvents(
  connection: {
    id: string
    accessToken: string
    refreshToken: string | null
    expiresAt: Date | null
  },
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  // Proactively refresh if token is expired
  let { accessToken } = connection
  if (connection.expiresAt && connection.expiresAt < new Date() && connection.refreshToken) {
    try {
      const refreshed = await refreshGoogleToken(connection.refreshToken)
      accessToken = refreshed.accessToken
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
        },
      })
    } catch {
      // If refresh fails, try with existing token anyway
    }
  }

  return fetchGoogleCalendarEvents(accessToken, connection.refreshToken, startDate, endDate)
}

/**
 * Fetches events from an Outlook Calendar connection via the Microsoft Graph API.
 *
 * Uses the `/me/calendarView` endpoint to get events within the date range.
 * Proactively refreshes expired tokens and retries once on 401 errors.
 * Events marked as "free" (showAs === "free") are excluded since they do
 * not represent conflicts.
 *
 * @param connection - Outlook calendar connection with OAuth tokens
 * @param startDate - Start of the date range to query
 * @param endDate - End of the date range to query
 * @returns Array of calendar events from Outlook, or empty array on failure
 */
async function fetchOutlookEvents(
  connection: {
    id: string
    accessToken: string
    refreshToken: string | null
    expiresAt: Date | null
  },
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  let { accessToken } = connection

  // Proactively refresh if token is expired
  if (connection.expiresAt && connection.expiresAt < new Date() && connection.refreshToken) {
    try {
      const refreshed = await refreshOutlookToken(connection.refreshToken)
      if (refreshed) {
        accessToken = refreshed.access_token
        await prisma.calendarConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || connection.refreshToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        })
      }
    } catch {
      // If refresh fails, try with existing token anyway
    }
  }

  try {
    const params = new URLSearchParams({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      $select: "subject,start,end,showAs",
      $top: "250",
      $orderby: "start/dateTime",
    })

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!res.ok) {
      if (res.status === 401 && connection.refreshToken) {
        // Try refresh and retry once
        const refreshed = await refreshOutlookToken(connection.refreshToken)
        if (!refreshed) return []

        await prisma.calendarConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || connection.refreshToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        })

        const retryRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
          {
            headers: {
              Authorization: `Bearer ${refreshed.access_token}`,
              "Content-Type": "application/json",
            },
          }
        )

        if (!retryRes.ok) return []
        const retryData = await retryRes.json()
        return parseOutlookEvents(retryData.value || [])
      }
      return []
    }

    const data = await res.json()
    return parseOutlookEvents(data.value || [])
  } catch (error) {
    console.error("Outlook Calendar fetch events error:", error)
    return []
  }
}

/**
 * Converts raw Microsoft Graph API calendar event objects to the common
 * {@link CalendarEvent} format. Filters out events where `showAs` is "free".
 *
 * Note: Outlook returns datetime strings without timezone suffix, so "Z" is
 * appended to interpret them as UTC (the API returns UTC when no timezone
 * preference is set).
 *
 * @param events - Raw event objects from the Microsoft Graph API response
 * @returns Parsed array of {@link CalendarEvent} objects
 */
function parseOutlookEvents(events: any[]): CalendarEvent[] {
  return events
    .filter((e: any) => e.showAs !== "free")
    .map((e: any) => ({
      start: new Date(e.start.dateTime + "Z"),
      end: new Date(e.end.dateTime + "Z"),
      calendarId: "primary",
      provider: "OUTLOOK",
      summary: e.subject || undefined,
    }))
}

/**
 * Refreshes an Outlook OAuth2 access token using the Microsoft identity platform.
 *
 * Sends a token refresh request to the Microsoft OAuth2 endpoint. The tenant ID
 * and client credentials are read from environment variables.
 *
 * @param refreshToken - The OAuth2 refresh token for the Outlook connection
 * @returns New token data with access_token, optional refresh_token, and expires_in seconds,
 *          or `null` if the refresh request failed
 */
async function refreshOutlookToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access",
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  )

  if (!res.ok) return null
  return res.json()
}

/**
 * Invalidates the in-memory event cache.
 *
 * Call this when calendar connections are added, removed, or modified
 * (e.g., toggling `checkConflicts` or changing the primary calendar) to
 * ensure the next availability check fetches fresh data.
 *
 * @param userId - If provided, clears only cache entries for this user.
 *                 If omitted, clears the entire cache for all users.
 *
 * @example
 * ```ts
 * // After updating a calendar connection
 * await prisma.calendarConnection.update({ ... })
 * clearEventCache(userId) // Force fresh fetch on next availability check
 * ```
 */
export function clearEventCache(userId?: string): void {
  if (userId) {
    const keys = Array.from(eventCache.keys())
    for (const key of keys) {
      if (key.startsWith(`${userId}:`)) {
        eventCache.delete(key)
      }
    }
  } else {
    eventCache.clear()
  }
}
