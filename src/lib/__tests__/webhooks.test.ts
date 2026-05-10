import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { signPayload, attemptHttpDelivery, nextAttemptDelay, persistAttemptResult, triggerWebhooks, MAX_DELIVERY_ATTEMPTS } from "../webhooks"

const mockWebhookFindMany = vi.fn()
const mockDeliveryCreate = vi.fn()
const mockDeliveryUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    webhook: {
      findMany: (...args: any[]) => mockWebhookFindMany(...args),
    },
    webhookDelivery: {
      create: (...args: any[]) => mockDeliveryCreate(...args),
      update: (...args: any[]) => mockDeliveryUpdate(...args),
    },
  },
}))

const originalFetch = global.fetch

describe("signPayload", () => {
  it("produces a deterministic 64-char hex digest", () => {
    const sig1 = signPayload("secret", "{}")
    const sig2 = signPayload("secret", "{}")
    expect(sig1).toBe(sig2)
    expect(sig1).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when secret or body changes", () => {
    expect(signPayload("a", "x")).not.toBe(signPayload("b", "x"))
    expect(signPayload("a", "x")).not.toBe(signPayload("a", "y"))
  })
})

describe("attemptHttpDelivery", () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns ok=true on 2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, status: 200 })
    const result = await attemptHttpDelivery({ url: "https://x", payload: "{}", signature: "sig" })
    expect(result).toEqual({ ok: true, responseCode: 200 })
  })

  it("returns ok=false on non-2xx with the response code", async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 503 })
    const result = await attemptHttpDelivery({ url: "https://x", payload: "{}", signature: "sig" })
    expect(result).toEqual({ ok: false, responseCode: 503, errorMessage: "HTTP 503" })
  })

  it("returns ok=false on network error (caught, never thrown)", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    const result = await attemptHttpDelivery({ url: "https://x", payload: "{}", signature: "sig" })
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe("ECONNREFUSED")
  })

  it("sends X-Webhook-Signature header", async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, status: 200 })
    await attemptHttpDelivery({ url: "https://x", payload: "{}", signature: "deadbeef" })
    const call = (global.fetch as any).mock.calls[0]
    expect(call[1].headers["X-Webhook-Signature"]).toBe("deadbeef")
  })
})

describe("nextAttemptDelay (backoff schedule)", () => {
  it("returns 30s after attempt 1", () => {
    expect(nextAttemptDelay(1)).toBe(30 * 1000)
  })

  it("returns 5min after attempt 2", () => {
    expect(nextAttemptDelay(2)).toBe(5 * 60 * 1000)
  })

  it("returns null after the final attempt (no more retries)", () => {
    expect(nextAttemptDelay(MAX_DELIVERY_ATTEMPTS)).toBeNull()
  })
})

describe("persistAttemptResult", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeliveryUpdate.mockResolvedValue({})
  })

  it("marks SUCCEEDED on ok=true", async () => {
    await persistAttemptResult("d-1", 1, { ok: true, responseCode: 200 })
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          attempt: 1,
          responseCode: 200,
          nextAttemptAt: null,
        }),
      })
    )
  })

  it("schedules next attempt on first failure (status stays PENDING)", async () => {
    const before = Date.now()
    await persistAttemptResult("d-1", 1, { ok: false, responseCode: 503 })
    const call = mockDeliveryUpdate.mock.calls[0][0]
    expect(call.data.status).toBe("PENDING")
    expect(call.data.responseCode).toBe(503)
    const nextMs = call.data.nextAttemptAt.getTime() - before
    expect(nextMs).toBeGreaterThanOrEqual(30 * 1000 - 50)
    expect(nextMs).toBeLessThanOrEqual(30 * 1000 + 1000)
  })

  it("schedules longer delay on second failure", async () => {
    const before = Date.now()
    await persistAttemptResult("d-1", 2, { ok: false, errorMessage: "timeout" })
    const call = mockDeliveryUpdate.mock.calls[0][0]
    expect(call.data.status).toBe("PENDING")
    const nextMs = call.data.nextAttemptAt.getTime() - before
    expect(nextMs).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50)
  })

  it("marks FAILED after the final attempt also fails", async () => {
    await persistAttemptResult("d-1", MAX_DELIVERY_ATTEMPTS, { ok: false, errorMessage: "still down" })
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          nextAttemptAt: null,
          errorMessage: "still down",
        }),
      })
    )
  })
})

describe("triggerWebhooks (fanout)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    mockDeliveryCreate.mockImplementation(async ({ data }) => ({ id: "d-new", ...data }))
    mockDeliveryUpdate.mockResolvedValue({})
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it("does nothing when no webhooks match", async () => {
    mockWebhookFindMany.mockResolvedValueOnce([])
    await triggerWebhooks("user-1", "booking.created", {})
    expect(mockDeliveryCreate).not.toHaveBeenCalled()
  })

  it("creates a Delivery row + attempts immediately + marks SUCCEEDED on 2xx", async () => {
    mockWebhookFindMany.mockResolvedValueOnce([
      { id: "wh-1", url: "https://hook/1", secret: "secret-1" },
    ])
    ;(global.fetch as any).mockResolvedValue({ ok: true, status: 200 })

    await triggerWebhooks("user-1", "booking.created", { hello: "world" })

    expect(mockDeliveryCreate).toHaveBeenCalledTimes(1)
    expect(mockDeliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookId: "wh-1", attempt: 1, status: "PENDING" }),
      })
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      })
    )
  })

  it("on first failure: row stays PENDING with nextAttemptAt set", async () => {
    mockWebhookFindMany.mockResolvedValueOnce([
      { id: "wh-1", url: "https://hook/1", secret: "secret-1" },
    ])
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 503 })

    await triggerWebhooks("user-1", "booking.created", {})

    const updateCall = mockDeliveryUpdate.mock.calls[0][0]
    expect(updateCall.data.status).toBe("PENDING")
    expect(updateCall.data.nextAttemptAt).toBeInstanceOf(Date)
  })

  it("fans out to multiple webhooks subscribed to the event", async () => {
    mockWebhookFindMany.mockResolvedValueOnce([
      { id: "wh-1", url: "https://hook/1", secret: "s1" },
      { id: "wh-2", url: "https://hook/2", secret: "s2" },
    ])
    ;(global.fetch as any).mockResolvedValue({ ok: true, status: 200 })

    await triggerWebhooks("user-1", "booking.created", {})
    expect(mockDeliveryCreate).toHaveBeenCalledTimes(2)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
