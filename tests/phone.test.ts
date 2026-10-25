import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

const ok = (phone: string) => ({ ok: true, phone });

describe("normalizePhone", () => {
  it("prefixes +91 to a 10-digit Indian mobile number", () => {
    expect(normalizePhone("9876543210")).toEqual(ok("+919876543210"));
    // A 10-digit number that happens to start with 91 is still a local number
    expect(normalizePhone("9198765432")).toEqual(ok("+919198765432"));
  });

  it("ignores spaces, dashes, dots and brackets", () => {
    expect(normalizePhone(" 98765-43210 ")).toEqual(ok("+919876543210"));
    expect(normalizePhone("(987) 654.3210")).toEqual(ok("+919876543210"));
  });

  it("accepts Indian numbers written with the country code, 00 or a leading 0", () => {
    for (const input of ["+91 98765 43210", "+91-9876543210", "919876543210", "0091 9876543210", "09876543210"]) {
      expect(normalizePhone(input)).toEqual(ok("+919876543210"));
    }
  });

  it("keeps other countries' numbers that include a country code", () => {
    expect(normalizePhone("+44 7911 123456")).toEqual(ok("+447911123456"));
    expect(normalizePhone("+1 (415) 555-2671")).toEqual(ok("+14155552671"));
  });

  it("rejects Indian numbers that are not mobiles or have the wrong length", () => {
    for (const input of ["5876543210", "987654321", "98765432101", "+91 98765 4321", "+91 5876543210"]) {
      expect(normalizePhone(input).ok, input).toBe(false);
    }
  });

  it("rejects foreign numbers without a +, and malformed input", () => {
    for (const input of ["447911123456", "abc", "98765abc10", "+", "++919876543210", "+0123456789", "+1234567", "+1234567890123456"]) {
      expect(normalizePhone(input).ok, input).toBe(false);
    }
  });

  it("says when the number is missing", () => {
    expect(normalizePhone("  ")).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
  });
});

describe("formatPhone", () => {
  it("groups Indian mobile numbers for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });

  it("shows other numbers as stored", () => {
    expect(formatPhone("+447911123456")).toBe("+447911123456");
  });
});
