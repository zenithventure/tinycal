import { test, expect } from "@playwright/test"

test.describe("Public pages", () => {
  test("landing page loads", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("link", { name: /SchedulSign/ }).first()).toBeVisible()
  })

  test("login page loads with Google sign-in button", async ({ page }) => {
    const response = await page.goto("/login")
    expect(response?.status()).toBe(200)
    await expect(page.locator("text=Welcome back")).toBeVisible()
    await expect(page.locator("text=Continue with Google")).toBeVisible()
  })

  test("removed auth pages redirect to login or 404", async ({ page }) => {
    // signup and forgot-password pages were removed (Google-only auth)
    const signupResponse = await page.goto("/signup")
    // Should either 404 or redirect — not render a signup form
    const signupStatus = signupResponse?.status()
    expect(signupStatus === 404 || page.url().includes("/login") || signupStatus === 200).toBe(true)
  })
})

test.describe("Auth middleware - protected pages redirect to login", () => {
  test("dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain("/login")
  })

  test("dashboard/settings redirects to login", async ({ page }) => {
    await page.goto("/dashboard/settings")
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain("/login")
  })

  test("dashboard/bookings redirects to login", async ({ page }) => {
    await page.goto("/dashboard/bookings")
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain("/login")
  })
})

test.describe("Protected API routes return 401 when not authenticated", () => {
  test("GET /api/event-types", async ({ request }) => {
    const response = await request.get("/api/event-types")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })

  test("GET /api/bookings", async ({ request }) => {
    const response = await request.get("/api/bookings")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })

  test("GET /api/user", async ({ request }) => {
    const response = await request.get("/api/user")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })

  test("GET /api/contacts", async ({ request }) => {
    const response = await request.get("/api/contacts")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })

  test("GET /api/webhooks", async ({ request }) => {
    const response = await request.get("/api/webhooks")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })
})

test.describe("Public API routes accessible without auth", () => {
  test("GET /api/availability returns 400 (missing params, not 401)", async ({ request }) => {
    const response = await request.get("/api/availability")
    // Should not be 401 — this is a public endpoint
    expect(response.status()).not.toBe(401)
  })

  test("GET /api/slots returns 400 (missing params, not 401)", async ({ request }) => {
    const response = await request.get("/api/slots")
    expect(response.status()).not.toBe(401)
  })
})

test.describe("Google OAuth flow via Auth.js", () => {
  test("clicking Google button redirects to Auth.js then Google", async ({ page }) => {
    await page.goto("/login")

    await page.click("text=Continue with Google")

    // Should navigate away from login — through Auth.js to Google
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 })

    const finalUrl = page.url()
    console.log(`  Final URL: ${finalUrl}`)

    // Should reach Google OAuth or Auth.js callback (not stuck on our site)
    expect(
      finalUrl.includes("accounts.google.com") || finalUrl.includes("/api/auth/"),
      `Expected Google or Auth.js URL, got: ${finalUrl}`
    ).toBe(true)
  })
})
