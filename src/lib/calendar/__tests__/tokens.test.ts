import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUpdate = vi.fn()
vi.mock("../../prisma", () => ({
  default: { calendarConnection: { update: (...a: any[]) => mockUpdate(...a) } },
}))

import { decrypt, encrypt, isEncrypted } from "../../crypto"
import { encryptToken, withDecryptedTokens } from "../tokens"

describe("withDecryptedTokens", () => {
  beforeEach(() => mockUpdate.mockReset())

  it("returns decrypted tokens for encrypted rows without writing", async () => {
    const result = await withDecryptedTokens({
      id: "c1",
      accessToken: encrypt("access"),
      refreshToken: encrypt("refresh"),
    })
    expect(result).toMatchObject({ accessToken: "access", refreshToken: "refresh" })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("re-encrypts legacy plaintext in place and still returns the token", async () => {
    const result = await withDecryptedTokens({
      id: "c1",
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
    })
    expect(result).toMatchObject({ accessToken: "legacy-access", refreshToken: "legacy-refresh" })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const { where, data } = mockUpdate.mock.calls[0][0]
    expect(where).toEqual({ id: "c1" })
    expect(isEncrypted(data.accessToken)).toBe(true)
    expect(decrypt(data.accessToken)).toBe("legacy-access")
    expect(decrypt(data.refreshToken)).toBe("legacy-refresh")
  })

  it("only migrates the legacy field in a mixed row, and handles null refresh", async () => {
    const enc = encrypt("refresh")
    await withDecryptedTokens({ id: "c1", accessToken: "legacy", refreshToken: enc })
    const { data } = mockUpdate.mock.calls[0][0]
    expect(data.refreshToken).toBeUndefined()
    expect(decrypt(data.accessToken)).toBe("legacy")

    mockUpdate.mockReset()
    const r = await withDecryptedTokens({ id: "c2", accessToken: encrypt("a"), refreshToken: null })
    expect(r.refreshToken).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("encryptToken passes through null/undefined", () => {
    expect(encryptToken(null)).toBeNull()
    expect(encryptToken(undefined)).toBeUndefined()
    expect(isEncrypted(encryptToken("x"))).toBe(true)
  })
})
