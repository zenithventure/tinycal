import { describe, it, expect, afterEach, vi } from "vitest"
import { decrypt, encrypt, isEncrypted } from "../crypto"

const ORIGINAL = process.env.CALENDAR_TOKEN_KEY

afterEach(() => {
  process.env.CALENDAR_TOKEN_KEY = ORIGINAL
})

describe("crypto", () => {
  it("round-trips and uses a random IV", () => {
    const a = encrypt("ya29.secret-token")
    const b = encrypt("ya29.secret-token")
    expect(a).not.toBe(b)
    expect(a).not.toContain("secret-token")
    expect(isEncrypted(a)).toBe(true)
    expect(decrypt(a)).toBe("ya29.secret-token")
    expect(decrypt(b)).toBe("ya29.secret-token")
  })

  it("round-trips unicode and empty strings", () => {
    expect(decrypt(encrypt("tökén-✓"))).toBe("tökén-✓")
    expect(decrypt(encrypt(""))).toBe("")
  })

  it("detects tampering", () => {
    const enc = encrypt("token")
    const buf = Buffer.from(enc.slice(3), "base64")
    buf[buf.length - 1] ^= 1
    expect(() => decrypt("v1." + buf.toString("base64"))).toThrow()
  })

  it("fails to decrypt with a different key", () => {
    const enc = encrypt("token")
    process.env.CALENDAR_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64")
    expect(() => decrypt(enc)).toThrow()
  })

  it("gracefully degrades (pass-through + warning) when the key is missing", () => {
    delete process.env.CALENDAR_TOKEN_KEY
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})
    // Pass-through instead of throw: ships safely before the key is configured.
    expect(encrypt("raw-token")).toBe("raw-token")
    expect(decrypt("v1.AAAA")).toBe("v1.AAAA")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it.each([16, 31, 33, 64])("rejects a %d-byte key", (len) => {
    process.env.CALENDAR_TOKEN_KEY = Buffer.alloc(len, 1).toString("base64")
    expect(() => encrypt("x")).toThrow(/must be 32 bytes/)
  })

  it("does not treat plaintext as ciphertext", () => {
    expect(isEncrypted("ya29.a0Af")).toBe(false)
  })
})
