import prisma from "../prisma"
import { decrypt, encrypt, isEncrypted } from "../crypto"

/**
 * Calendar OAuth token storage helpers.
 *
 * Tokens are stored as AES-256-GCM ciphertext (`v1.<base64>`, see ../crypto.ts)
 * in the existing `accessToken` / `refreshToken` String columns.
 *
 * Migration-on-read: rows written before encryption hold the raw token. Any
 * value without the `v1.` prefix is treated as legacy plaintext; on first read
 * it is used as-is and re-encrypted in place, so later reads take the decrypt
 * path. No SQL migration is needed. Rows that are never read stay plaintext
 * until they are (or until an ops one-off script reads them all).
 */

/** Encrypt token fields for a write. Leaves null/undefined untouched. */
export function encryptToken(token: string): string
export function encryptToken(token: string | null | undefined): string | null | undefined
export function encryptToken(token: string | null | undefined) {
  return token ? encrypt(token) : token
}

/** Decrypt a stored value; legacy plaintext is returned unchanged. */
function readToken(stored: string): string {
  return isEncrypted(stored) ? decrypt(stored) : stored
}

/**
 * Returns the connection with plaintext tokens, re-encrypting legacy
 * plaintext rows in place. Pass any object loaded from `calendarConnection`.
 */
export async function withDecryptedTokens<
  T extends { id: string; accessToken: string; refreshToken: string | null },
>(connection: T): Promise<T> {
  const legacyAccess = !isEncrypted(connection.accessToken)
  const legacyRefresh = !!connection.refreshToken && !isEncrypted(connection.refreshToken)

  if (legacyAccess || legacyRefresh) {
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        ...(legacyAccess && { accessToken: encrypt(connection.accessToken) }),
        ...(legacyRefresh && { refreshToken: encrypt(connection.refreshToken!) }),
      },
    })
  }

  return {
    ...connection,
    accessToken: readToken(connection.accessToken),
    refreshToken: connection.refreshToken ? readToken(connection.refreshToken) : null,
  }
}
