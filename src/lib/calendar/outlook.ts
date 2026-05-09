import { Client } from "@microsoft/microsoft-graph-client"
import prisma from "../prisma"

async function getOutlookClient(userId: string) {
  const connection = await prisma.calendarConnection.findFirst({
    where: { userId, provider: "OUTLOOK" },
  })
  if (!connection) return null

  // Check if token needs refresh
  if (connection.expiresAt && connection.expiresAt < new Date()) {
    const refreshed = await refreshOutlookToken(connection.refreshToken!)
    if (refreshed) {
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || connection.refreshToken,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
      })
      connection.accessToken = refreshed.access_token
    }
  }

  return Client.init({
    authProvider: (done) => {
      done(null, connection.accessToken)
    },
  })
}

async function refreshOutlookToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access",
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", body: params, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  )

  if (!res.ok) return null
  return res.json()
}

export async function getOutlookBusyTimes(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<{ start: Date; end: Date }[]> {
  const client = await getOutlookClient(userId)
  if (!client) return []

  try {
    const res = await client
      .api("/me/calendarView")
      .query({
        startDateTime: startTime.toISOString(),
        endDateTime: endTime.toISOString(),
        $select: "start,end,showAs",
      })
      .get()

    return (res.value || [])
      .filter((e: any) => e.showAs !== "free")
      .map((e: any) => ({
        start: new Date(e.start.dateTime + "Z"),
        end: new Date(e.end.dateTime + "Z"),
      }))
  } catch (error) {
    console.error("Outlook busy times error:", error)
    return []
  }
}

export async function createOutlookCalendarEvent(
  userId: string,
  event: {
    summary: string
    description?: string
    startTime: Date
    endTime: Date
    attendees: { email: string }[]
    isOnline?: boolean
  }
) {
  const client = await getOutlookClient(userId)
  if (!client) return null

  try {
    const res = await client.api("/me/events").post({
      subject: event.summary,
      body: { contentType: "HTML", content: event.description || "" },
      start: { dateTime: event.startTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: event.endTime.toISOString(), timeZone: "UTC" },
      attendees: event.attendees.map((a) => ({
        emailAddress: { address: a.email },
        type: "required",
      })),
      isOnlineMeeting: event.isOnline,
      onlineMeetingProvider: event.isOnline ? "teamsForBusiness" : undefined,
    })
    return {
      id: res.id,
      meetingUrl: res.onlineMeeting?.joinUrl,
    }
  } catch (error) {
    console.error("Outlook create event error:", error)
    return null
  }
}

export async function updateOutlookCalendarEvent(
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
  const client = await getOutlookClient(userId)
  if (!client) return null

  try {
    const res = await client.api(`/me/events/${eventId}`).patch({
      start: { dateTime: event.startTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: event.endTime.toISOString(), timeZone: "UTC" },
      ...(event.summary && { subject: event.summary }),
      ...(event.description && { body: { contentType: "HTML", content: event.description } }),
      ...(event.attendees && {
        attendees: event.attendees.map((a) => ({
          emailAddress: { address: a.email },
          type: "required",
        })),
      }),
    })
    return {
      id: res.id,
      meetingUrl: res.onlineMeeting?.joinUrl,
    }
  } catch (error) {
    console.error("Outlook update event error:", error)
    return null
  }
}

export async function deleteOutlookCalendarEvent(userId: string, eventId: string) {
  const client = await getOutlookClient(userId)
  if (!client) return
  try {
    await client.api(`/me/events/${eventId}`).delete()
  } catch (error) {
    console.error("Outlook delete event error:", error)
  }
}

export function getOutlookAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`,
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access User.Read",
    response_mode: "query",
  })
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`
}
