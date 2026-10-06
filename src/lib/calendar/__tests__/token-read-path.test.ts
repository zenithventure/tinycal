import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSetCredentials = vi.fn()
const mockFreebusy = vi.fn()
vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({ events: {}, freebusy: { query: mockFreebusy } }),
    auth: {
      OAuth2: class {
        setCredentials(c: any) { mockSetCredentials(c) }
        on() {}
      },
    },
  },
}))

const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
vi.mock("../../prisma", () => ({
  default: {
    calendarConnection: {
      findFirst: (...a: any[]) => mockFindFirst(...a),
      update: (...a: any[]) => mockUpdate(...a),
    },
  },
}))

import { decrypt, encrypt, isEncrypted } from "../../crypto"
import { getGoogleCalendarClient } from "../google"

describe("calendar connection read path", () => {
  beforeEach(() => vi.clearAllMocks())

  it("hands the decrypted tokens to the Google client", async () => {
    mockFindFirst.mockResolvedValue({
      id: "c1", accessToken: encrypt("plain-access"), refreshToken: encrypt("plain-refresh"),
    })
    await getGoogleCalendarClient("u1")
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: "plain-access",
      refresh_token: "plain-refresh",
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("uses a legacy plaintext row as-is and re-encrypts it in the DB", async () => {
    mockFindFirst.mockResolvedValue({
      id: "c1", accessToken: "legacy-access", refreshToken: "legacy-refresh",
    })
    await getGoogleCalendarClient("u1")
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: "legacy-access",
      refresh_token: "legacy-refresh",
    })
    const { data } = mockUpdate.mock.calls[0][0]
    expect(isEncrypted(data.accessToken)).toBe(true)
    expect(decrypt(data.accessToken)).toBe("legacy-access")
    expect(decrypt(data.refreshToken)).toBe("legacy-refresh")
  })
})
