import { test, expect } from "@playwright/test"
import { addDays, format, nextMonday } from "date-fns"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const USER_SLUG = process.env.TEST_USER_SLUG || "szewong"

// We discover the event type ID dynamically from the slots API
let eventTypeId: string

test.describe.serial("Full booking → reschedule → cancel flow", () => {
  let bookingUid: string
  let bookingStartTime: string

  test("Step 1: Discover event type ID from profile page", async ({ page }) => {
    // Navigate to the booking page to find the event type ID
    await page.goto(`/${USER_SLUG}`)
    const firstLink = page.locator(`a[href^="/${USER_SLUG}/"]`).first()
    const href = await firstLink.getAttribute("href")
    expect(href).toBeTruthy()

    // Go to the booking page — it renders a BookingWidget that calls /api/slots
    // Intercept the slots API call to capture the eventTypeId
    const slotsPromise = page.waitForRequest((req) => req.url().includes("/api/slots"))
    await page.goto(href!)

    // Click a future day to trigger the slots request
    const enabledDay = page.locator("button:not([disabled])").filter({ hasText: /^\d+$/ })
    if ((await enabledDay.count()) > 0) {
      await enabledDay.first().click()
    }

    const slotsRequest = await slotsPromise
    const url = new URL(slotsRequest.url())
    eventTypeId = url.searchParams.get("eventTypeId")!
    expect(eventTypeId).toBeTruthy()
    console.log(`  Discovered eventTypeId: ${eventTypeId}`)
  })

  test("Step 2: Fetch available slots", async ({ request }) => {
    // Pick next Monday to ensure it's a weekday
    const nextMon = nextMonday(addDays(new Date(), 1))
    const dateStr = format(nextMon, "yyyy-MM-dd")

    const response = await request.get(
      `${BASE}/api/slots?eventTypeId=${eventTypeId}&date=${dateStr}&timezone=America/New_York`
    )
    expect(response.status()).toBe(200)

    const slots = await response.json()
    expect(Array.isArray(slots)).toBe(true)
    expect(slots.length).toBeGreaterThan(0)

    // Pick the first available slot
    bookingStartTime = slots[0].start
    console.log(`  Found ${slots.length} slots, using: ${bookingStartTime}`)
  })

  test("Step 3: Create a booking", async ({ request }) => {
    const response = await request.post(`${BASE}/api/bookings`, {
      data: {
        eventTypeId,
        startTime: bookingStartTime,
        bookerName: "E2E Test Booker",
        bookerEmail: "e2e-test@example.com",
        bookerTimezone: "America/New_York",
      },
    })

    expect(response.status()).toBe(200)
    const booking = await response.json()
    expect(booking.uid).toBeTruthy()
    expect(booking.status).toBe("CONFIRMED")
    expect(booking.bookerName).toBe("E2E Test Booker")
    expect(booking.bookerEmail).toBe("e2e-test@example.com")

    bookingUid = booking.uid
    console.log(`  Created booking: ${bookingUid}`)
  })

  test("Step 4: Verify booking via GET", async ({ request }) => {
    const response = await request.get(`${BASE}/api/bookings/${bookingUid}`)
    expect(response.status()).toBe(200)

    const booking = await response.json()
    expect(booking.uid).toBe(bookingUid)
    expect(booking.status).toBe("CONFIRMED")
    expect(booking.eventTypeId).toBe(eventTypeId)
    expect(booking.bookerName).toBe("E2E Test Booker")
    expect(booking.eventType.title).toBeTruthy()
    expect(booking.eventType.duration).toBeGreaterThan(0)
  })

  test("Step 5: Reschedule page loads with time slots", async ({ page }) => {
    await page.goto(`/reschedule/${bookingUid}`)
    await expect(page.getByRole("heading", { name: "Reschedule Booking" })).toBeVisible()

    // Click a future weekday — slots should load since we have a valid booking
    const enabledDay = page.locator("button:not([disabled])").filter({ hasText: /^\d+$/ })
    if ((await enabledDay.count()) > 0) {
      await enabledDay.last().click()
      await page.waitForTimeout(2000)
      // Should show time slots or "No available times" (not an error)
      const timeSlots = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/i })
      const noTimes = page.locator("text=No available times")
      const hasTimes = (await timeSlots.count()) > 0
      const hasNoTimes = (await noTimes.count()) > 0
      expect(hasTimes || hasNoTimes).toBe(true)
    }
  })

  test("Step 6: Reschedule the booking via API", async ({ request }) => {
    // Get a different time slot — use next Tuesday
    const nextTue = addDays(nextMonday(addDays(new Date(), 1)), 1)
    const dateStr = format(nextTue, "yyyy-MM-dd")

    const slotsRes = await request.get(
      `${BASE}/api/slots?eventTypeId=${eventTypeId}&date=${dateStr}&timezone=America/New_York`
    )
    expect(slotsRes.status()).toBe(200)
    const slots = await slotsRes.json()
    expect(slots.length).toBeGreaterThan(0)

    const newStartTime = slots[0].start
    console.log(`  Rescheduling to: ${newStartTime}`)

    const response = await request.post(`${BASE}/api/bookings/${bookingUid}/reschedule`, {
      data: { newStartTime },
    })
    expect(response.status()).toBe(200)

    const updated = await response.json()
    expect(updated.startTime).toBe(newStartTime)
  })

  test("Step 7: Verify booking was updated", async ({ request }) => {
    const response = await request.get(`${BASE}/api/bookings/${bookingUid}`)
    expect(response.status()).toBe(200)

    const booking = await response.json()
    expect(booking.uid).toBe(bookingUid)
    expect(booking.status).toBe("CONFIRMED")
  })

  test("Step 8: Reschedule same booking again should still work", async ({ request }) => {
    // Verify the booking isn't stuck in RESCHEDULED status (since we update in-place)
    const nextWed = addDays(nextMonday(addDays(new Date(), 1)), 2)
    const dateStr = format(nextWed, "yyyy-MM-dd")

    const slotsRes = await request.get(
      `${BASE}/api/slots?eventTypeId=${eventTypeId}&date=${dateStr}&timezone=America/New_York`
    )
    const slots = await slotsRes.json()
    if (slots.length > 0) {
      const response = await request.post(`${BASE}/api/bookings/${bookingUid}/reschedule`, {
        data: { newStartTime: slots[0].start },
      })
      expect(response.status()).toBe(200)
    }
  })

  test("Step 9: Cancel page loads for the booking", async ({ page }) => {
    await page.goto(`/cancel/${bookingUid}`)
    await expect(page.getByRole("heading", { name: "Cancel Booking" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Cancel Booking" })).toBeVisible()
  })

  test("Step 10: Cancel the booking via API", async ({ request }) => {
    const response = await request.post(`${BASE}/api/bookings/${bookingUid}/cancel`, {
      data: { reason: "E2E test cleanup" },
    })
    expect(response.status()).toBe(200)
  })

  test("Step 11: Verify booking is cancelled", async ({ request }) => {
    const response = await request.get(`${BASE}/api/bookings/${bookingUid}`)
    expect(response.status()).toBe(200)

    const booking = await response.json()
    expect(booking.status).toBe("CANCELLED")
  })

  test("Step 12: Cannot reschedule a cancelled booking", async ({ request }) => {
    const response = await request.post(`${BASE}/api/bookings/${bookingUid}/reschedule`, {
      data: { newStartTime: new Date().toISOString() },
    })
    expect(response.status()).toBe(400)
  })
})

test.describe.serial("Conflict detection", () => {
  let slotTime: string
  let booking1Uid: string

  test("Book a slot, then verify same slot is unavailable", async ({ request }) => {
    // Get slots for next Monday
    const nextMon = nextMonday(addDays(new Date(), 1))
    const dateStr = format(nextMon, "yyyy-MM-dd")

    const slotsRes = await request.get(
      `${BASE}/api/slots?eventTypeId=${eventTypeId}&date=${dateStr}&timezone=America/New_York`
    )
    const slots = await slotsRes.json()
    expect(slots.length).toBeGreaterThan(0)
    slotTime = slots[0].start

    // Book it
    const bookRes = await request.post(`${BASE}/api/bookings`, {
      data: {
        eventTypeId,
        startTime: slotTime,
        bookerName: "Conflict Test",
        bookerEmail: "conflict-test@example.com",
        bookerTimezone: "America/New_York",
      },
    })
    expect(bookRes.status()).toBe(200)
    booking1Uid = (await bookRes.json()).uid

    // Try to book the same slot again — should get 409 conflict
    const duplicateRes = await request.post(`${BASE}/api/bookings`, {
      data: {
        eventTypeId,
        startTime: slotTime,
        bookerName: "Conflict Test 2",
        bookerEmail: "conflict-test-2@example.com",
        bookerTimezone: "America/New_York",
      },
    })
    expect(duplicateRes.status()).toBe(409)
  })

  test("Clean up: cancel the conflict test booking", async ({ request }) => {
    const response = await request.post(`${BASE}/api/bookings/${booking1Uid}/cancel`, {
      data: { reason: "E2E conflict test cleanup" },
    })
    expect(response.status()).toBe(200)
  })
})
