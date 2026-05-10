import { describe, it, expect } from "vitest"
import { generateApiKey, hashSecret, parseApiKey, KEY_PREFIX } from "../generate"

describe("generateApiKey", () => {
  it("produces a key with the tc_live_ prefix", () => {
    const { fullKey } = generateApiKey()
    expect(fullKey.startsWith(KEY_PREFIX)).toBe(true)
  })

  it("produces a parseable key matching its stored prefix and hash", () => {
    const { fullKey, prefix, hashedSecret } = generateApiKey()
    const parsed = parseApiKey(fullKey)
    expect(parsed).not.toBeNull()
    expect(parsed!.prefix).toBe(prefix)
    expect(hashSecret(parsed!.secret)).toBe(hashedSecret)
  })

  it("produces unique keys on repeated calls", () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.fullKey).not.toBe(b.fullKey)
    expect(a.prefix).not.toBe(b.prefix)
    expect(a.hashedSecret).not.toBe(b.hashedSecret)
  })

  it("uses 8-char hex prefix and 64-char hex secret", () => {
    const { prefix, hashedSecret } = generateApiKey()
    expect(prefix).toMatch(/^[0-9a-f]{8}$/)
    expect(hashedSecret).toMatch(/^[0-9a-f]{64}$/) // sha256 hex
  })
})

describe("parseApiKey", () => {
  it("returns null for tokens without the tc_live_ prefix", () => {
    expect(parseApiKey("user-cuid-12345")).toBeNull()
    expect(parseApiKey("Bearer foo")).toBeNull()
    expect(parseApiKey("")).toBeNull()
  })

  it("returns null for tc_live_ tokens missing a separator", () => {
    expect(parseApiKey("tc_live_abcdef")).toBeNull()
  })

  it("returns null for tc_live_ tokens with non-hex parts", () => {
    expect(parseApiKey("tc_live_zzzzzzzz_abcdef")).toBeNull()
    expect(parseApiKey("tc_live_abcdef12_zzzz")).toBeNull()
  })

  it("returns null when prefix or secret is empty", () => {
    expect(parseApiKey("tc_live__abcdef")).toBeNull()
    expect(parseApiKey("tc_live_abcdef_")).toBeNull()
  })

  it("parses a valid key", () => {
    const parsed = parseApiKey("tc_live_abcd1234_deadbeefcafe")
    expect(parsed).toEqual({ prefix: "abcd1234", secret: "deadbeefcafe" })
  })
})

describe("hashSecret", () => {
  it("is deterministic", () => {
    expect(hashSecret("hello")).toBe(hashSecret("hello"))
  })

  it("produces different hashes for different inputs", () => {
    expect(hashSecret("a")).not.toBe(hashSecret("b"))
  })
})
