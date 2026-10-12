import { describe, it, expect } from "vitest"
import { parseMoneyToCents, centsToDecimalString, isValidCents } from "@/lib/money"

describe("money", () => {
  it("round-trips 19.99 <-> 1999", () => {
    expect(parseMoneyToCents("19.99")).toBe(1999)
    expect(centsToDecimalString(1999)).toBe("19.99")
  })
  it("avoids float error (0.29, 1.15)", () => {
    expect(parseMoneyToCents("0.29")).toBe(29)
    expect(parseMoneyToCents("1.15")).toBe(115)
  })
  it("handles whole and single-decimal inputs", () => {
    expect(parseMoneyToCents("10")).toBe(1000)
    expect(parseMoneyToCents("10.5")).toBe(1050)
    expect(centsToDecimalString(5)).toBe("0.05")
    expect(centsToDecimalString(null)).toBe("")
  })
  it("rejects invalid input", () => {
    expect(parseMoneyToCents("abc")).toBeNull()
    expect(parseMoneyToCents("1.999")).toBeNull()
    expect(parseMoneyToCents("-1")).toBeNull()
  })
  it("isValidCents requires non-negative integers", () => {
    expect(isValidCents(1999)).toBe(true)
    expect(isValidCents(19.99)).toBe(false)
    expect(isValidCents(-1)).toBe(false)
    expect(isValidCents("1999")).toBe(false)
  })
})
