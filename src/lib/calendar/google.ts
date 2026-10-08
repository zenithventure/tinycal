import { google } from "googleapis"
import prisma from "../prisma"
import { encryptToken, withDecryptedTokens } from "./tokens"

export function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  )
}

export async function getGoogleCalendarClient(userId: string) {
  // Prefer the connection the user marked as Primary so events land on the
  // host's intended calendar. Non-primary Google calendars stay connected
  // for conflict checking only (see conflict-detection.ts).
  const stored = await prisma.calendarConnection.findFirst({
    where: { userId, provider: "GOOGLE" },
    orderBy: { isPrimary: "desc" },
  })
  if (!stored) return null
  const connection = await withDecryptedTokens(stored)

  const auth = getGoogleOAuth2Client()
  auth.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
  })

  // Auto-refresh
  auth.on("tokens", async (tokens) => {
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptToken(tokens.access_token || connection.accessToken),
        refreshToken: encryptToken(tokens.refresh_token || connection.refreshToken),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  })

  return google.calendar({ version: "v3", auth })
}

export async function createGoogleCalendarEvent(
  userId: string,
  event: {
    summary: string
    description?: string
    startTime: Date
    endTime: Date
    attendees: { email: string }[]
    conferenceData?: boolean
  }
) {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return null

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: event.conferenceData ? 1 : 0,
      // Without sendUpdates: "all", Google's default is "none" — so attendees
      // (the booker and, for collective event types, every co-host) never
      // receive an invite email and the event may not sync to their primary
      // calendars. events.patch already uses "all" for reschedules; mirror
      // that here so create + update both notify everyone.
      sendUpdates: "all",
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
        attendees: event.attendees,
        ...(event.conferenceData && {
          conferenceData: {
            createRequest: {
              requestId: `tinycal-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    })
    return {
      id: res.data.id,
      meetingUrl: res.data.hangoutLink || res.data.conferenceData?.entryPoints?.[0]?.uri,
    }
  } catch (error) {
    console.error("Google Calendar create event error:", error)
    return null
  }
}

export type GoogleEventLookup =
  | { status: "ok"; start: Date; end: Date }
  | { status: "cancelled" }
  | { status: "gone" }
  | { status: "not_found" }
  | { status: "error"; reason: string }

// Read a single event by id. Used by the reconcile cron to detect when the
// host moved or deleted the event directly in Google Calendar. Returns the
// event status alongside its time window so callers can diff and decide.
//
// 410 Gone is split out from 404 because Google returns 410 specifically when
// an event has been deleted (it lingers as `status: "cancelled"` for a window,
// then 410). A 404 could also mean the eventId was never on this calendar —
// e.g. a pre-primary-fix booking written to a different connection. Callers
// treat "gone" as a confirmed deletion and "not_found" as ambiguous.
export async function getGoogleCalendarEvent(
  userId: string,
  eventId: string
): Promise<GoogleEventLookup> {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return { status: "error", reason: "no_google_client" }

  try {
    const res = await calendar.events.get({ calendarId: "primary", eventId })
    const ev = res.data
    if (ev.status === "cancelled") return { status: "cancelled" }
    const startStr = ev.start?.dateTime
    const endStr = ev.end?.dateTime
    if (!startStr || !endStr) {
      return { status: "error", reason: "missing_dateTime" }
    }
    return { status: "ok", start: new Date(startStr), end: new Date(endStr) }
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number })?.code ?? (err as { code?: number; status?: number })?.status
    if (code === 410) return { status: "gone" }
    if (code === 404) return { status: "not_found" }
    return { status: "error", reason: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  event: {
    startTime: Date
    endTime: Date
    summary?: string
    description?: string
    attendees?: { email: string }[]
  }
) {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return null

  try {
    const res = await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: {
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
        ...(event.summary && { summary: event.summary }),
        ...(event.description && { description: event.description }),
        ...(event.attendees && { attendees: event.attendees }),
      },
    })
    return {
      id: res.data.id,
      meetingUrl: res.data.hangoutLink || res.data.conferenceData?.entryPoints?.[0]?.uri,
    }
  } catch (error) {
    console.error("Google Calendar update event error:", error)
    return null
  }
}

export async function deleteGoogleCalendarEvent(userId: string, eventId: string) {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return
  try {
    await calendar.events.delete({ calendarId: "primary", eventId })
  } catch (error) {
    console.error("Google Calendar delete event error:", error)
  }
}

/**
 * Represents a calendar event fetched from an external calendar provider.
 * Used as the common format across Google Calendar and Outlook integrations
 * for the multi-calendar conflict detection system.
 */
export interface CalendarEvent {
  /** Event start time in UTC */
  start: Date
  /** Event end time in UTC */
  end: Date
  /** The calendar ID within the provider (e.g., "primary" for Google) */
  calendarId: string
  /** The calendar provider identifier ("GOOGLE" or "OUTLOOK") */
  provider: string
  /** Optional event title/summary for display purposes */
  summary?: string
}

/**
 * Refreshes a Google OAuth2 access token using the stored refresh token.
 *
 * This is called automatically when a token has expired or when the Google API
 * returns a 401 error. The caller is responsible for persisting the new tokens
 * to the database.
 *
 * @param refreshToken - The OAuth2 refresh token stored for the calendar connection
 * @returns An object containing the new access token and its expiration date
 * @throws Will throw if the refresh token is invalid or revoked by the user
 *
 * @example
 * ```ts
 * const refreshed = await refreshGoogleToken(connection.refreshToken)
 * // Persist the new tokens
 * await prisma.calendarConnection.update({
 *   where: { id: connection.id },
 *   data: { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt },
 * })
 * ```
 */
export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await oauth2Client.refreshAccessToken()

  return {
    accessToken: credentials.access_token!,
    expiresAt: new Date(credentials.expiry_date!),
  }
}

/** Hard cap on events a single fetch may return (regression guard, #116).
 *  A busy month can exceed one 250-event page — unpaginated reads would
 *  silently miss conflicts (and a broken infinite nextPageToken loop would
 *  hang a booking request). 5000 events ≫ any sane month window. */
export const GOOGLE_FETCH_EVENT_CAP = 5000

/**
 * Fetch a single page of events (up to `maxResults`) and map it to the
 * common {@link CalendarEvent} shape, dropping cancelled/all-day/free events.
 * Shared by the primary path and the 401-retry path so both behave
 * identically (#116 regression: the retry path used to return only page 1).
 *
 * `calendar` is typed loosely on purpose: googleapis's `events.list` has a
 * provider-specific params type and we only need `data.items` /
 * `data.nextPageToken` from the response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchGooglePageAsEvents(
  calendar: any,
  baseParams: {
    calendarId: string
    timeMin: string
    timeMax: string
    singleEvents: boolean
    orderBy: string
    maxResults: number
  },
  pageToken?: string
): Promise<{ events: CalendarEvent[]; nextPageToken?: string }> {
  const res = await calendar.events.list({ ...baseParams, pageToken })
  const items: any[] = res.data.items || []
  const events: CalendarEvent[] = []
  for (const item of items) {
    // Skip cancelled events
    if (item.status === "cancelled") continue
    // Skip all-day events with no specific time
    if (!item.start?.dateTime || !item.end?.dateTime) continue
    // Skip events marked as free/transparent
    if (item.transparency === "transparent") continue
    events.push({
      start: new Date(item.start.dateTime),
      end: new Date(item.end.dateTime),
      calendarId: "primary",
      provider: "GOOGLE",
      summary: item.summary || undefined,
    })
  }
  return { events, nextPageToken: res.data.nextPageToken || undefined }
}

/**
 * Fetch events from a Google Calendar for a given date range.
 *
 * Paginates through all result pages (250 events/page) up to
 * GOOGLE_FETCH_EVENT_CAP, and automatically retries once with a refreshed
 * token if the API returns a 401 Unauthorized error. The 401-retry path
 * continues pagination too — #116 regression fix: the old retry returned only
 * the first 250 events, so a conflict on page 2+ was silently missed.
 *
 * Events are filtered to exclude:
 * - Cancelled events
 * - All-day events (no specific dateTime)
 * - Events marked as "transparent" (shown as free)
 *
 * @param accessToken - The current OAuth2 access token
 * @param refreshToken - The OAuth2 refresh token for automatic retry on 401 errors
 * @param startDate - Start of the date range to query (inclusive)
 * @param endDate - End of the date range to query (exclusive)
 * @returns Array of {@link CalendarEvent} objects, or an empty array on failure
 *
 * @example
 * ```ts
 * const events = await fetchGoogleCalendarEvents(
 *   connection.accessToken,
 *   connection.refreshToken,
 *   new Date("2026-02-01"),
 *   new Date("2026-02-28")
 * )
 * console.log(`Found ${events.length} busy events`)
 * ```
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  refreshToken: string | null,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const baseParams = {
    calendarId: "primary",
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  }

  const paginate = async (calendar: ReturnType<typeof google.calendar>): Promise<CalendarEvent[]> => {
    const allEvents: CalendarEvent[] = []
    let pageToken: string | undefined
    do {
      const page = await fetchGooglePageAsEvents(calendar, baseParams, pageToken)
      allEvents.push(...page.events)
      // Hard cap: protects against both runaway calendars and a stale
      // nextPageToken that would loop forever (see GOOGLE_FETCH_EVENT_CAP).
      if (allEvents.length >= GOOGLE_FETCH_EVENT_CAP) break
      pageToken = page.nextPageToken
    } while (pageToken)
    return allEvents
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client })

  try {
    return await paginate(calendar)
  } catch (error: any) {
    // Handle token expiry - attempt one refresh, then re-paginate from page 1
    // (a refresh invalidates prior pagination state). The retry path
    // historically returned only the first 250 events (#116 regression: a
    // conflict on page 2+ went undetected); it now goes through the same
    // bounded paginator as the primary path.
    if (error?.code === 401 && refreshToken) {
      try {
        const refreshed = await refreshGoogleToken(refreshToken)
        oauth2Client.setCredentials({
          access_token: refreshed.accessToken,
          refresh_token: refreshToken,
        })
        const retryCalendar = google.calendar({ version: "v3", auth: oauth2Client })
        return await paginate(retryCalendar)
      } catch (refreshError) {
        console.error("Google Calendar token refresh failed:", refreshError)
        return []
      }
    }

    console.error("Google Calendar fetch events error:", error)
    return []
  }
}

/**
 * Fetches Google Calendar events for a specific CalendarConnection record.
 *
 * This is a convenience wrapper around {@link fetchGoogleCalendarEvents} that
 * looks up the connection details from the database by ID and handles token
 * refresh persistence automatically. Use this when you have a connection ID
 * but not the raw tokens.
 *
 * @param connectionId - The database ID of the CalendarConnection record
 * @param startDate - Start of the date range to query (inclusive)
 * @param endDate - End of the date range to query (exclusive)
 * @returns Array of {@link CalendarEvent} objects, or empty array if connection
 *          is not found, not a Google provider, or token refresh fails
 *
 * @example
 * ```ts
 * const events = await fetchGoogleCalendarEventsByConnectionId(
 *   "clx1abc123",
 *   new Date("2026-02-01"),
 *   new Date("2026-02-28")
 * )
 * ```
 */
export async function fetchGoogleCalendarEventsByConnectionId(
  connectionId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const stored = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
  })

  if (!stored || stored.provider !== "GOOGLE") return []
  const connection = await withDecryptedTokens(stored)

  // Check if token is expired and refresh proactively
  if (connection.expiresAt && connection.expiresAt < new Date() && connection.refreshToken) {
    try {
      const refreshed = await refreshGoogleToken(connection.refreshToken)
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: encryptToken(refreshed.accessToken),
          expiresAt: refreshed.expiresAt,
        },
      })
      connection.accessToken = refreshed.accessToken
    } catch (error) {
      console.error(`Failed to refresh token for connection ${connectionId}:`, error)
      return []
    }
  }

  return fetchGoogleCalendarEvents(
    connection.accessToken,
    connection.refreshToken,
    startDate,
    endDate
  )
}
