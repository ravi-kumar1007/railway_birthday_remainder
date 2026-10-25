export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalizes a phone number to E.164 (+919876543210). Shared by the employee form, the importer
 * and the server. Without a + or 00 prefix the number is taken as Indian: 10 digits, 0 + 10 digits,
 * or 91 + 10 digits. Spreadsheet numbers must be turned into digit strings before calling this.
 */
export function normalizePhone(input: string): PhoneResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Phone number is required." };
  if (!/^\+?[\d\s().-]+$/.test(raw)) {
    return { ok: false, error: "Use digits only, for example 98765 43210." };
  }

  let digits = raw.replace(/\D/g, "");
  let international = raw.startsWith("+");
  if (!international && digits.startsWith("00")) {
    international = true;
    digits = digits.slice(2);
  }

  if (!international) {
    if (digits.length === 10) digits = `91${digits}`;
    else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
    else if (!(digits.length === 12 && digits.startsWith("91"))) {
      return {
        ok: false,
        error: "Enter a 10-digit mobile number, or include the country code (for example +44 7911 123456).",
      };
    }
  }

  if (digits.startsWith("91")) {
    return INDIAN_MOBILE.test(digits.slice(2))
      ? { ok: true, phone: `+${digits}` }
      : { ok: false, error: "Indian mobile numbers have 10 digits and start with 6, 7, 8 or 9." };
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return { ok: false, error: "Enter a valid number with its country code, for example +44 7911 123456." };
  }
  return { ok: true, phone: `+${digits}` };
}

/** +919876543210 -> +91 98765 43210, for display. Other countries are shown as stored. */
export function formatPhone(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}
