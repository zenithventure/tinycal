import { describe, it, expect, vi, beforeEach } from "vitest"
import { canonicalJson, hashRequestBody, lookupIdempotency, recordIdempotentResponse, IDEMPOTENCY_TTL_MS } from "../idempotency"

const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
const mockDelete = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: {
    idempotencyKey: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      delete: (...args: any[]) => mockDelete(...args),
    },
  },
}))

describe("canonicalJson", () => {
  it("sorts object keys recursively (so different orderings hash the same)", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
    expect(canonicalJson({ x: { a: 1, b: 2 } })).toBe(canonicalJson({ x: { b: 2, a: 1 } }))
  })

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]")
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]))
  })

  it("handles primitives + null", () => {
    expect(canonicalJson(null)).toBe("null")
    expect(canonicalJson(42)).toBe("42")
    expect(canonicalJson("foo")).toBe('"foo"')
    expect(canonicalJson(true)).toBe("true")
  })
})

describe("hashRequestBody", () => {
  it("returns the same hex hash for objects with reordered keys", () => {
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(hashRequestBody({ b: 2, a: 1 }))
  })

  it("returns a 64-char hex string", () => {
    expect(hashRequestBody({ x: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("lookupIdempotency", () => {
  beforeEach(() => vi.clearAllMocks())

  const HASH = hashRequestBody({ x: 1 })

  it("returns miss when no row exists", async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const result = await lookupIdempotency("ak-1", "key-1", HASH)
    expect(result.kind).toBe("miss")
  })

  it("returns mismatch when stored row has a different requestHash", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "ik-1", requestHash: "different-hash",
      responseStatus: 201, responseBody: {},
      createdAt: new Date(),
    })
    const result = await lookupIdempotency("ak-1", "key-1", HASH)
    expect(result.kind).toBe("mismatch")
  })

  it("returns replay with the cached response when hash matches and not stale", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "ik-1", requestHash: HASH,
      responseStatus: 201, responseBody: { data: { id: "bk-1" } },
      createdAt: new Date(),
    })
    const result = await lookupIdempotency("ak-1", "key-1", HASH)
    expect(result.kind).toBe("replay")
    if (result.kind === "replay") {
      expect(result.response.status).toBe(201)
      expect(result.response.headers.get("X-Idempotent-Replay")).toBe("true")
      const body = await result.response.json()
      expect(body).toEqual({ data: { id: "bk-1" } })
    }
  })

  it("treats rows older than TTL as miss and deletes them", async () => {
    const stale = new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000)
    mockFindUnique.mockResolvedValueOnce({
      id: "ik-1", requestHash: HASH,
      responseStatus: 201, responseBody: {},
      createdAt: stale,
    })
    mockDelete.mockResolvedValueOnce({})
    const result = await lookupIdempotency("ak-1", "key-1", HASH)
    expect(result.kind).toBe("miss")
    expect(mockDelete).toHaveBeenCalled()
  })
})

describe("recordIdempotentResponse", () => {
  beforeEach(() => vi.clearAllMocks())

  it("persists 2xx responses", async () => {
    mockCreate.mockResolvedValueOnce({})
    await recordIdempotentResponse({
      apiKeyId: "ak-1",
      idempotencyKey: "key-1",
      requestHash: "hash",
      responseStatus: 201,
      responseBody: { data: {} },
    })
    expect(mockCreate).toHaveBeenCalled()
  })

  it("does NOT persist non-2xx responses (so clients can retry)", async () => {
    await recordIdempotentResponse({
      apiKeyId: "ak-1",
      idempotencyKey: "key-1",
      requestHash: "hash",
      responseStatus: 409,
      responseBody: { error: "conflict" },
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("swallows P2002 race losses (logged, not thrown)", async () => {
    const { Prisma } = await import("@prisma/client")
    mockCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002", clientVersion: "5.22.0",
      })
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await expect(recordIdempotentResponse({
      apiKeyId: "ak-1",
      idempotencyKey: "key-1",
      requestHash: "hash",
      responseStatus: 201,
      responseBody: { data: {} },
    })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("re-throws non-P2002 Prisma errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("connection lost"))
    await expect(recordIdempotentResponse({
      apiKeyId: "ak-1",
      idempotencyKey: "key-1",
      requestHash: "hash",
      responseStatus: 201,
      responseBody: { data: {} },
    })).rejects.toThrow("connection lost")
  })
})
