import { test, expect } from "@playwright/test"

test.describe("Event Type Creation", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/api/auth/signin")
    await page.fill('input[name="email"]', "test@example.com")
    await page.click('button[type="submit"]')
    // Wait for redirect to dashboard
    await page.waitForURL(/dashboard/)
  })

  test("should reset loading state after successful event type creation", async ({ page }) => {
    await page.goto("/dashboard/event-types")

    // Click "New Event Type" button
    await page.click('button:has-text("New Event Type")')

    // Fill in the form
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Test Meeting")
    await page.selectOption('select:has-text("30 min")', "30")
    await page.selectOption('select:has-text("Google Meet")', "GOOGLE_MEET")

    // Submit the form
    await page.click('button:has-text("Create")')

    // Wait for the modal to close
    await expect(page.locator('text="Create Event Type"')).not.toBeVisible()

    // Verify the new event type appears in the list
    await expect(page.locator('text="Test Meeting"')).toBeVisible()

    // Now try to create another event type
    await page.click('button:has-text("New Event Type")')
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Second Meeting")
    await page.click('button:has-text("Create")')

    // Wait for the modal to close
    await expect(page.locator('text="Create Event Type"')).not.toBeVisible()

    // Verify both event types exist
    await expect(page.locator('text="Test Meeting"')).toBeVisible()
    await expect(page.locator('text="Second Meeting"')).toBeVisible()
  })

  test("should reset loading state after failed event type creation", async ({ page, context }) => {
    // Block the API to simulate failure
    await context.route("**/api/event-types", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        })
      } else {
        route.continue()
      }
    })

    await page.goto("/dashboard/event-types")

    // Click "New Event Type" button
    await page.click('button:has-text("New Event Type")')

    // Fill in the form
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Test Meeting")

    // Submit the form (should fail)
    await page.click('button:has-text("Create")')

    // Wait for the error alert
    page.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("Failed to create event type")
      dialog.accept()
    })

    // Verify the modal is still open (creation failed)
    await expect(page.locator('text="Create Event Type"')).toBeVisible()

    // Verify the button is no longer disabled (loading state reset)
    const createButton = page.locator('button:has-text("Create")')
    await expect(createButton).not.toBeDisabled()
  })

  test("should allow creating multiple event types in succession", async ({ page }) => {
    await page.goto("/dashboard/event-types")

    // Create first event type
    await page.click('button:has-text("New Event Type")')
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Quick Chat")
    await page.click('button:has-text("Create")')
    await expect(page.locator('text="Quick Chat"')).toBeVisible()

    // Create second event type
    await page.click('button:has-text("New Event Type")')
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Consultation")
    await page.click('button:has-text("Create")')
    await expect(page.locator('text="Consultation"')).toBeVisible()

    // Create third event type
    await page.click('button:has-text("New Event Type")')
    await page.fill('input[placeholder="e.g. 30 Minute Meeting"]', "Demo")
    await page.click('button:has-text("Create")')
    await expect(page.locator('text="Demo"')).toBeVisible()

    // Verify all three exist
    await expect(page.locator('text="Quick Chat"')).toBeVisible()
    await expect(page.locator('text="Consultation"')).toBeVisible()
    await expect(page.locator('text="Demo"')).toBeVisible()
  })
})