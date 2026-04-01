/**
 * Generate "Add to Calendar" URLs and ICS file content for meetings.
 */

function formatDateForGoogle(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

export function googleCalendarUrl(params: {
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
}): string {
  const url = new URL("https://calendar.google.com/calendar/render")
  url.searchParams.set("action", "TEMPLATE")
  url.searchParams.set("text", params.title)
  url.searchParams.set("dates", `${formatDateForGoogle(params.start)}/${formatDateForGoogle(params.end)}`)
  if (params.description) url.searchParams.set("details", params.description)
  if (params.location) url.searchParams.set("location", params.location)
  return url.toString()
}

export function outlookCalendarUrl(params: {
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
}): string {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose")
  url.searchParams.set("subject", params.title)
  url.searchParams.set("startdt", params.start.toISOString())
  url.searchParams.set("enddt", params.end.toISOString())
  if (params.description) url.searchParams.set("body", params.description)
  if (params.location) url.searchParams.set("location", params.location)
  url.searchParams.set("path", "/calendar/action/compose")
  return url.toString()
}

export function generateICS(params: {
  uid: string
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
  organizerName?: string
  organizerEmail?: string
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TinyCal//Meeting Link//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${params.uid}@tinycal`,
    `DTSTART:${formatDateForICS(params.start)}`,
    `DTEND:${formatDateForICS(params.end)}`,
    `SUMMARY:${escapeICSText(params.title)}`,
  ]

  if (params.description) {
    lines.push(`DESCRIPTION:${escapeICSText(params.description)}`)
  }
  if (params.location) {
    lines.push(`LOCATION:${escapeICSText(params.location)}`)
  }
  if (params.organizerName && params.organizerEmail) {
    lines.push(`ORGANIZER;CN=${escapeICSText(params.organizerName)}:mailto:${params.organizerEmail}`)
  }

  lines.push(
    `DTSTAMP:${formatDateForICS(new Date())}`,
    "END:VEVENT",
    "END:VCALENDAR"
  )

  return lines.join("\r\n")
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}
