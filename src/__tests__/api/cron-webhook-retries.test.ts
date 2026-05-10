import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockDeliveryFindMany = vi.fn()
const mockDeliveryUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    webhookDelivery: {
      findMany: (...args: any[]) => mockDeliveryFindMany(...args),
      update: (...args: any[]) => mockDeliveryUpdate(...args),
    },
  },
}))

import { GET } from "@/app/api/cron/webhook-retries/route"

const originalFetch = global.fetch
const SECRET = "test-cron-secret"

function makeReq(token = SECRET): Request {
  return new Request("http://localhost/api/cron/webhook-retries", {
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe("GET /api/cron/webhook-retries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = SECRET
    global.fetch = vi.fn()
    mockDeliveryUpdate.mockResolvedValue({})
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns 401 without the cron secret", async () => {
    const res = await GET(new Request("http://x/api/cron/webhook-retries"))
    expect(res.status).toBe(401)
  })

  it("returns 401 with the wrong cron secret", async () => {
    const res = await GET(makeReq("wrong"))
    expect(res.status).toBe(401)
  })

  it("returns 200 with zeros when nothing is due", async () => {
    mockDeliveryFindMany.mockResolvedValueOnce([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ processed: 0, succeeded: 0, stillRetrying: 0, failed: 0 })
  })

  it("retries a due delivery and marks it SUCCEEDED on 2xx", async () => {
    mockDeliveryFindMany.mockResolvedValueOnce([{
      id: "d-1", attempt: 1, signature: "sig", payload: { event: "booking.created" },
      webhook: { url: "https://hook/1" },
    }])
    ;(global.fetch as any).mockResolvedValue({ ok: true, status: 200 })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body).toEqual({ processed: 1, succeeded: 1, stillRetrying: 0, failed: 0 })
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1" },
        data: expect.objectContaining({ status: "SUCCEEDED", attempt: 2 }),
      })
    )
  })

  it("on second-attempt failure (attempt was 1, now 2): keeps PENDING with new backoff", async () => {
    mockDeliveryFindMany.mockResolvedValueOnce([{
      id: "d-1", attempt: 1, signature: "sig", payload: {}, webhook: { url: "https://hook" },
    }])
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 503 })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.stillRetrying).toBe(1)
    expect(body.failed).toBe(0)
  })

  it("on the final attempt failing: marks FAILED", async () => {
    // attempt was 2, retried = 3 = MAX
    mockDeliveryFindMany.mockResolvedValueOnce([{
      id: "d-1", attempt: 2, signature: "sig", payload: {}, webhook: { url: "https://hook" },
    }])
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 503 })

    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.failed).toBe(1)
    expect(body.stillRetrying).toBe(0)
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      })
    )
  })

  it("only picks up rows where status=PENDING and nextAttemptAt <= now", async () => {
    mockDeliveryFindMany.mockResolvedValueOnce([])
    await GET(makeReq())
    expect(mockDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          nextAttemptAt: { lte: expect.any(Date) },
        }),
      })
    )
  })
})
