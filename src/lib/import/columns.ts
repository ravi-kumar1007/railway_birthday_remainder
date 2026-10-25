import { cellText, type Cell } from "./cells";

export const IMPORT_FIELDS = ["name", "phone", "birthday", "empCode", "consent"] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_FIELDS: readonly ImportField[] = ["name", "phone", "birthday"];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  phone: "Phone",
  birthday: "Date of birth",
  empCode: "Employee code",
  consent: "WhatsApp consent",
};

/** Which column (by index) holds each field; null when the file doesn't have it */
export type ColumnMapping = Record<ImportField, number | null>;

// Headers are compared lowercased, without punctuation or (bracketed hints)
const ALIASES: Record<ImportField, readonly string[]> = {
  name: ["name", "employeename", "fullname", "empname", "employee", "staffname"],
  phone: [
    "phone", "mobile", "whatsapp", "phonenumber", "mobilenumber", "whatsappnumber", "phoneno", "mobileno",
    "whatsappno", "contact", "contactnumber", "contactno", "cell", "cellphone",
  ],
  birthday: ["dob", "birthday", "dateofbirth", "birthdate", "bday"],
  empCode: [
    "empcode", "employeecode", "id", "empid", "employeeid", "code", "staffid", "staffcode", "employeeno",
    "empno", "employeenumber",
  ],
  consent: ["consent", "whatsappconsent", "optin", "whatsappoptin", "agreed"],
};

function normalizeHeader(header: Cell): string {
  return cellText(header)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function fieldFor(header: Cell): ImportField | null {
  const key = normalizeHeader(header);
  return IMPORT_FIELDS.find((field) => ALIASES[field].includes(key)) ?? null;
}

export function detectColumns(headers: readonly Cell[]): ColumnMapping {
  const mapping: ColumnMapping = { name: null, phone: null, birthday: null, empCode: null, consent: null };
  headers.forEach((header, index) => {
    const field = fieldFor(header);
    if (field && mapping[field] === null) mapping[field] = index;
  });
  return mapping;
}

/**
 * The header row: the first of the top 10 rows with at least two recognised headers, so title rows
 * above the table are skipped. Otherwise the first row with two or more filled cells.
 */
export function findHeaderRow(rows: readonly (readonly Cell[])[]): number {
  const top = rows.slice(0, 10);
  const recognised = top.findIndex((row) => row.filter((cell) => fieldFor(cell) !== null).length >= 2);
  if (recognised !== -1) return recognised;
  const filled = top.findIndex((row) => row.filter((cell) => cellText(cell) !== "").length >= 2);
  return filled === -1 ? 0 : filled;
}
