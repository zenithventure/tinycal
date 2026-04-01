import { describe, it, expect } from "vitest"
import { googleCalendarUrl, outlookCalendarUrl, generateICS } from "../calendar-links"

// ─── Test Data ───

const TEST_PARAMS = {
  title: "Team Standup",
  start: new Date("2026-04-15T14:00:00Z"),
  end: new Date("2026-04-15T14:30:00Z"),
}

// ─── Google Calendar URL ───

describe("googleCalendarUrl", () => {
  it("generates a valid Google Calendar URL with required fields", () => {
    const url = googleCalendarUrl(TEST_PARAMS)
    expect(url).toContain("https://calendar.google.com/calendar/render")
    expect(url).toContain("action=TEMPLATE")
    expect(url).toContain("text=Team+Standup")
    // Dates in YYYYMMDDTHHmmSSZ format
    expect(url).toContain("20260415T140000Z")
    expect(url).toContain("20260415T143000Z")
  })

  it("includes description when provided", () => {
    const url = googleCalendarUrl({ ...TEST_PARAMS, description: "Daily sync" })
    expect(url).toContain("details=Daily+sync")
  })

  it("includes location when provided", () => {
    const url = googleCalendarUrl({ ...TEST_PARAMS, location: "https://meet.google.com/abc" })
    expect(url).toContain("location=")
    expect(url).toContain("meet.google.com")
  })

  it("omits optional fields when not provided", () => {
    const url = googleCalendarUrl(TEST_PARAMS)
    expect(url).not.toContain("details=")
    expect(url).not.toContain("location=")
  })

  it("encodes special characters in title", () => {
    const url = googleCalendarUrl({ ...TEST_PARAMS, title: "Meeting & Review" })
    expect(url).toContain("Meeting")
    // URL should be properly encoded (& should not break params)
    const parsed = new URL(url)
    expect(parsed.searchParams.get("text")).toBe("Meeting & Review")
  })
})

// ─── Outlook Calendar URL ───

describe("outlookCalendarUrl", () => {
  it("generates a valid Outlook Calendar URL", () => {
    const url = outlookCalendarUrl(TEST_PARAMS)
    expect(url).toContain("https://outlook.live.com/calendar/0/deeplink/compose")
    expect(url).toContain("subject=Team+Standup")
    expect(url).toContain("startdt=")
    expect(url).toContain("enddt=")
  })

  it("uses ISO date format for start and end", () => {
    const url = outlookCalendarUrl(TEST_PARAMS)
    const parsed = new URL(url)
    expect(parsed.searchParams.get("startdt")).toBe("2026-04-15T14:00:00.000Z")
    expect(parsed.searchParams.get("enddt")).toBe("2026-04-15T14:30:00.000Z")
  })

  it("includes optional fields when provided", () => {
    const url = outlookCalendarUrl({
      ...TEST_PARAMS,
      description: "Weekly review",
      location: "Conference Room A",
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get("body")).toBe("Weekly review")
    expect(parsed.searchParams.get("location")).toBe("Conference Room A")
  })

  it("includes path parameter", () => {
    const url = outlookCalendarUrl(TEST_PARAMS)
    const parsed = new URL(url)
    expect(parsed.searchParams.get("path")).toBe("/calendar/action/compose")
  })
})

// ─── ICS File Generation ───

describe("generateICS", () => {
  const ICS_PARAMS = {
    uid: "booking-123",
    title: "Team Standup",
    start: new Date("2026-04-15T14:00:00Z"),
    end: new Date("2026-04-15T14:30:00Z"),
  }

  it("generates valid ICS structure", () => {
    const ics = generateICS(ICS_PARAMS)
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).toContain("END:VCALENDAR")
    expect(ics).toContain("BEGIN:VEVENT")
    expect(ics).toContain("END:VEVENT")
    expect(ics).toContain("VERSION:2.0")
    expect(ics).toContain("PRODID:-//TinyCal//Meeting Link//EN")
  })

  it("includes correct event details", () => {
    const ics = generateICS(ICS_PARAMS)
    expect(ics).toContain("UID:booking-123@tinycal")
    expect(ics).toContain("SUMMARY:Team Standup")
    expect(ics).toContain("DTSTART:20260415T140000Z")
    expect(ics).toContain("DTEND:20260415T143000Z")
  })

  it("includes description when provided", () => {
    const ics = generateICS({ ...ICS_PARAMS, description: "Daily sync meeting" })
    expect(ics).toContain("DESCRIPTION:Daily sync meeting")
  })

  it("includes location when provided", () => {
    const ics = generateICS({ ...ICS_PARAMS, location: "https://meet.google.com/abc" })
    expect(ics).toContain("LOCATION:https://meet.google.com/abc")
  })

  it("includes organizer when name and email provided", () => {
    const ics = generateICS({
      ...ICS_PARAMS,
      organizerName: "Alice",
      organizerEmail: "alice@example.com",
    })
    expect(ics).toContain("ORGANIZER;CN=Alice:mailto:alice@example.com")
  })

  it("omits organizer when not provided", () => {
    const ics = generateICS(ICS_PARAMS)
    expect(ics).not.toContain("ORGANIZER")
  })

  it("escapes special characters in text fields", () => {
    const ics = generateICS({
      ...ICS_PARAMS,
      title: "Meeting; with, special\nchars",
    })
    expect(ics).toContain("SUMMARY:Meeting\\; with\\, special\\nchars")
  })

  it("uses CRLF line endings", () => {
    const ics = generateICS(ICS_PARAMS)
    expect(ics).toContain("\r\n")
    // Should not have bare \n (without preceding \r)
    const lines = ics.split("\r\n")
    expect(lines.length).toBeGreaterThan(5)
  })

  it("includes DTSTAMP", () => {
    const ics = generateICS(ICS_PARAMS)
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
  })
})
