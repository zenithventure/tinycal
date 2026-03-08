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
  const connection = await prisma.calendarConnection.findFirst({
    where: { userId, provider: "GOOGLE" },
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
              requestId: `schedulsign-${Date.now()}`,
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

export async function deleteGoogleCalendarEvent(userId: string, eventId: string) {
  const calendar = await getGoogleCalendarClient(userId)
  if (!calendar) return
  try {
    await calendar.events.delete({ calendarId: "primary", eventId })
  } catch (error) {
    console.error("Google Calendar delete event error:", error)
  }
}
