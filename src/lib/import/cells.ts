import { isValidBirthday, type Birthday } from "../birthday";
import { normalizePhone } from "../phone";

/** A spreadsheet cell as SheetJS or PapaParse hands it over */
export type Cell = string | number | boolean | null;

export type CellResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return "";
  // Undo the ' that the CSV export puts before cells a spreadsheet would run as a formula
  return String(cell).trim().replace(/^'(?=[=+\-@])/, "");
}

// Excel day 0 is 30 Dec 1899. Workbooks made with the 1904 date system count from 1 Jan 1904.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAYS_1904_OFFSET = 1462;
const DAY_MS = 86_400_000;

function fromExcelSerial(serial: number, date1904: boolean): Birthday | null {
  const days = Math.floor(serial) + (date1904 ? DAYS_1904_OFFSET : 0);
  // Excel believes 1900 was a leap year, so its days before 1 Mar 1900 are off by one
  if (days < 61 || days > 2_958_465) return null;
  const date = new Date(EXCEL_EPOCH_MS + days * DAY_MS);
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "Aug", "august" or "Sept" -> 8. At least three letters, and a prefix of the real name. */
function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower === "sept") return 9;
  const index = MONTHS.findIndex((month) => lower.length >= 3 && month.startsWith(lower));
  return index === -1 ? null : index + 1;
}

const ORDINAL = "(?:st|nd|rd|th)?";
const TIME = "(?:[T ]\\d{1,2}:\\d{2}.*)?";
const ISO = new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${TIME}$`);
const NUMERIC = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})${TIME}$`);
const TWO_DIGIT_YEAR = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}$/;
const DAY_MONTH_NAME_YEAR = new RegExp(`^(\\d{1,2})${ORDINAL}[-\\s/.]+([a-z]+)\\.?[-\\s/.,]+(\\d{4})$`, "i");
const MONTH_NAME_DAY_YEAR = new RegExp(`^([a-z]+)\\.?\\s+(\\d{1,2})${ORDINAL},?\\s+(\\d{4})$`, "i");
const DAY_MONTH_NAME = new RegExp(`^(\\d{1,2})${ORDINAL}[-\\s/.]+([a-z]+)\\.?$`, "i");
const SERIAL_TEXT = /^\d{5}(\.\d+)?$/;

const FORMATS_HINT = "Use DD-MM-YYYY, for example 15-08-1990.";

function checked(birthday: Birthday | null): CellResult<Birthday> {
  if (!birthday) return { ok: false, error: `Couldn't read this date. ${FORMATS_HINT}` };
  return isValidBirthday(birthday) ? { ok: true, value: birthday } : { ok: false, error: "That date doesn't exist." };
}

function withMonthName(day: string, monthName: string, year: string | null): CellResult<Birthday> {
  const month = monthFromName(monthName);
  return checked(month ? { day: Number(day), month, year: year === null ? null : Number(year) } : null);
}

/**
 * Reads a date of birth cell: an Excel serial number, DD-MM-YYYY (also / or .), DD-MMM-YYYY,
 * YYYY-MM-DD, or DD-MMM with no year. Ambiguous numeric dates are read as DD/MM, the Indian order.
 */
export function birthdayFromCell(cell: Cell, { date1904 = false } = {}): CellResult<Birthday> {
  if (typeof cell === "number") return checked(fromExcelSerial(cell, date1904));

  const text = cellText(cell).replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Date of birth is missing." };

  if (SERIAL_TEXT.test(text)) return checked(fromExcelSerial(Number(text), date1904));
  if (TWO_DIGIT_YEAR.test(text)) return { ok: false, error: `Use a 4-digit year. ${FORMATS_HINT}` };

  let match = ISO.exec(text);
  if (match) return checked({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });

  match = NUMERIC.exec(text);
  if (match) {
    const [first, second, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // DD/MM unless the second number can't be a month, which makes it MM/DD
    return second <= 12
      ? checked({ day: first, month: second, year })
      : checked({ day: second, month: first, year });
  }

  match = DAY_MONTH_NAME_YEAR.exec(text);
  if (match) return withMonthName(match[1], match[2], match[3]);
  match = MONTH_NAME_DAY_YEAR.exec(text);
  if (match) return withMonthName(match[2], match[1], match[3]);
  match = DAY_MONTH_NAME.exec(text);
  if (match) return withMonthName(match[1], match[2], null);

  return checked(null);
}

/** Reads a phone cell into E.164. Spreadsheet number cells arrive as numbers. */
export function phoneFromCell(cell: Cell): CellResult<string> {
  let text = typeof cell === "number" && Number.isInteger(cell) ? cell.toFixed(0) : cellText(cell);
  if (/^\d(\.\d+)?e\+\d+$/i.test(text)) {
    return {
      ok: false,
      error: "Excel shortened this number (like 9.19E+11). Format the phone column as Text and save the file again.",
    };
  }
  text = text.replace(/^(\d+)\.0+$/, "$1");
  const result = normalizePhone(text);
  return result.ok ? { ok: true, value: result.phone } : result;
}

const YES = new Set(["yes", "y", "true", "1", "agreed", "agree", "consented", "opted in", "optin"]);
const NO = new Set(["no", "n", "false", "0", "not agreed", "declined", "opted out", "optout"]);

/** Yes/No style consent. A blank cell is null: the file doesn't say. */
export function consentFromCell(cell: Cell): CellResult<boolean | null> {
  if (typeof cell === "boolean") return { ok: true, value: cell };
  const text = cellText(cell).toLowerCase();
  if (!text) return { ok: true, value: null };
  if (YES.has(text)) return { ok: true, value: true };
  if (NO.has(text)) return { ok: true, value: false };
  return { ok: false, error: "WhatsApp consent should be Yes or No." };
}
