import { google } from "googleapis"
import prisma from "../prisma"

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
  const connection = await prisma.calendarConnection.findFirst({
    where: { userId, provider: "GOOGLE" },
    orderBy: { isPrimary: "desc" },
  })
  if (!connection) return null

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
        accessToken: tokens.access_token || connection.accessToken,
        refreshToken: tokens.refresh_token || connection.refreshToken,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  })

  return google.calendar({ version: "v3", auth })
}

export async function getGoogleBusyTimes(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<{ start: Date; end: Date }[]> {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return []

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: "primary" }],
      },
    })

    const busy = res.data.calendars?.primary?.busy || []
    return busy.map((b) => ({
      start: new Date(b.start!),
      end: new Date(b.end!),
    }))
  } catch (error) {
    console.error("Google Calendar busy times error:", error)
    return []
  }
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
  | { status: "not_found" }
  | { status: "error"; reason: string }

// Read a single event by id. Used by the reconcile cron to detect when the
// host moved or deleted the event directly in Google Calendar. Returns the
// event status alongside its time window so callers can diff and decide.
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
    if (code === 404 || code === 410) return { status: "not_found" }
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
