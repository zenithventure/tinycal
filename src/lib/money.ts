// Money is stored and transported as integer minor units (cents). Convert to
// and from decimal strings only at the presentation/input boundary.

/** Parse a user-typed decimal amount ("19.99") into integer cents, or null if invalid. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ""] = s.split(".")
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"))
}

/** Integer cents → plain decimal string for inputs ("1999" → "19.99"). */
export function centsToDecimalString(cents: number | null | undefined): string {
  if (cents == null) return ""
  const abs = Math.abs(cents)
  const str = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
  return cents < 0 ? `-${str}` : str
}

/** Validates a price value coming from an API body: non-negative safe integer cents. */
export function isValidCents(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 99_999_999
}
