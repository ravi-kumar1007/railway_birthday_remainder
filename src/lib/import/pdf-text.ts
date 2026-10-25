/** A piece of text pdf.js found, positioned in PDF units (y grows upwards) */
export type PdfTextItem = { str: string; x: number; y: number; page: number };

/** Rebuilds lines of text: items on the same baseline, top to bottom and left to right, page by page. */
export function groupIntoLines(items: readonly PdfTextItem[], tolerance = 3): string[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: { page: number; y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && line.page === item.page && Math.abs(line.y - item.y) <= tolerance) line.items.push(item);
    else lines.push({ page: item.page, y: item.y, items: [item] });
  }
  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DATE_PATTERNS = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/,
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[-\\s]${MONTH}[-\\s,]+\\d{4}\\b`, "i"),
];
// Digits with optional + and separators; checked for 10 to 15 digits below
const PHONE = /\+?\d[\d\s().-]{8,20}\d/g;
const NAME_WORD = /^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u;
const CODE_WORD = /^(?=.*\d)(?=.*\p{L})[\p{L}\p{N}/_-]+$/u;

type PdfRow = { empCode: string; name: string; phone: string; date: string };

function rowFromLine(line: string): PdfRow | null {
  const datePattern = DATE_PATTERNS.find((pattern) => pattern.test(line));
  const date = datePattern ? datePattern.exec(line)![0] : null;
  if (!date) return null;
  const withoutDate = line.replace(date, " ");

  const phone = [...withoutDate.matchAll(PHONE)]
    .map((match) => match[0].trim())
    .find((candidate) => {
      const digits = candidate.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15;
    });
  if (!phone) return null;

  // What's left: the name, plus perhaps a serial number and an employee code like E-102
  const words = withoutDate.replace(phone, " ").split(/[\s,|;]+/).filter(Boolean);
  return {
    empCode: words.find((word) => CODE_WORD.test(word)) ?? "",
    name: words.filter((word) => NAME_WORD.test(word)).join(" "),
    phone,
    date,
  };
}

/**
 * Finds employee rows in the text of a PDF: lines with a date and a phone number, the rest of
 * the line being the name. Returns null when there are none, as with a scanned (image-only) PDF.
 */
export function tableFromPdfLines(lines: readonly string[]): { headers: string[]; rows: string[][] } | null {
  const rows = lines.map(rowFromLine).filter((row): row is PdfRow => row !== null);
  if (rows.length === 0) return null;
  const withCodes = rows.some((row) => row.empCode !== "");
  return withCodes
    ? {
        headers: ["Emp Code", "Name", "Phone", "Date of Birth"],
        rows: rows.map((row) => [row.empCode, row.name, row.phone, row.date]),
      }
    : {
        headers: ["Name", "Phone", "Date of Birth"],
        rows: rows.map((row) => [row.name, row.phone, row.date]),
      };
}
