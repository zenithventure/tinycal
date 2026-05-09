import crypto from "crypto"

export const KEY_PREFIX = "tc_live_"

export interface GeneratedApiKey {
  fullKey: string       // tc_live_<prefix>_<secret> — shown to user once, never stored
  prefix: string        // 8 hex chars, stored on the row for display + lookup
  hashedSecret: string  // sha256(secret) hex, stored on the row
}

// Mints a new API key. The full key is shown to the user once and never
// retrievable; only the prefix and hash of the secret are persisted.
export function generateApiKey(): GeneratedApiKey {
  const prefix = crypto.randomBytes(4).toString("hex")  // 8 hex chars
  const secret = crypto.randomBytes(32).toString("hex") // 64 hex chars
  return {
    fullKey: `${KEY_PREFIX}${prefix}_${secret}`,
    prefix,
    hashedSecret: hashSecret(secret),
  }
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex")
}

export interface ParsedApiKey {
  prefix: string
  secret: string
}

// Parses a full key like "tc_live_<prefix>_<secret>" into its parts. Returns
// null for any string that doesn't match the format — used to fall through to
// legacy User.id-as-Bearer auth.
export function parseApiKey(key: string): ParsedApiKey | null {
  if (!key.startsWith(KEY_PREFIX)) return null
  const rest = key.slice(KEY_PREFIX.length)
  const sep = rest.indexOf("_")
  if (sep <= 0 || sep === rest.length - 1) return null
  const prefix = rest.slice(0, sep)
  const secret = rest.slice(sep + 1)
  if (!/^[0-9a-f]+$/i.test(prefix) || !/^[0-9a-f]+$/i.test(secret)) return null
  return { prefix, secret }
}
