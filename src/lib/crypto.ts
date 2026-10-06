import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * AES-256-GCM encryption for secrets stored at rest (calendar OAuth tokens).
 *
 * Stored format: `v1.` + base64(iv[12] || authTag[16] || ciphertext).
 * The `v1.` prefix is a magic marker that lets callers tell ciphertext from
 * legacy plaintext values (see `isEncrypted` and src/lib/calendar/tokens.ts).
 *
 * The key comes from CALENDAR_TOKEN_KEY (32 random bytes, base64; generate with
 * `openssl rand -base64 32`). A per-purpose AES key is derived from it with
 * HKDF-SHA256 so the raw env value is never used directly as the cipher key.
 */

export const CIPHERTEXT_PREFIX = "v1."

const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_ENV = "CALENDAR_TOKEN_KEY"
const HKDF_INFO = "tinycal:calendar-token:v1"

// Returns the derived AES key, or null when the key env is absent.
// Absent => graceful pass-through (tokens stay as-is, with a loud warning).
// This lets the change ship safely to an environment that hasn't been given
// a key yet, and becomes enforcing the moment the key is present. A key that
// is present but the wrong size is a real misconfiguration and still throws.
function getKey(): Buffer | null {
  const raw = process.env[KEY_ENV]
  if (!raw) return null
  const master = Buffer.from(raw, "base64")
  if (master.length !== 32) {
    throw Error(`${KEY_ENV} must be 32 bytes, base64-encoded (got ${master.length} bytes).`)
  }
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), HKDF_INFO, 32))
}

let warned = false
function warnMissingKey(): void {
  if (warned) return
  warned = true
  console.error(
    `[crypto] ${KEY_ENV} is not set — calendar tokens are NOT being encrypted at rest. ` +
      `Generate one with \`openssl rand -base64 32\` and add it to the environment to activate encryption.`
  )
}

/** True if the value carries the ciphertext marker (i.e. was written by `encrypt`). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHERTEXT_PREFIX)
}

/**
 * Encrypt a token for storage. If the key env is absent the value is returned
 * unchanged (graceful pass-through — see getKey), so encryption only takes
 * effect once the key is configured.
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  if (!key) {
    warnMissingKey()
    return plaintext
  }
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return CIPHERTEXT_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

/**
 * Decrypt a stored token. A value without the `v1.` marker, or one written
 * while no key was configured, is returned as-is (legacy plaintext).
 */
export function decrypt(cipherB64: string): string {
  const key = getKey()
  if (!key) {
    return cipherB64
  }
  const body = cipherB64.startsWith(CIPHERTEXT_PREFIX)
    ? cipherB64.slice(CIPHERTEXT_PREFIX.length)
    : cipherB64
  const buf = Buffer.from(body, "base64")
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short")
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
