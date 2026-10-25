import type { Employee } from "@/db/schema";
import { MONTH_NAMES } from "./birthday";

/** Export columns. The importer recognises each of these headers. */
export const EMPLOYEE_CSV_HEADERS = ["Emp Code", "Name", "Phone", "Date of Birth", "WhatsApp Consent", "Active"] as const;

type CsvEmployee = Pick<
  Employee,
  "empCode" | "name" | "phone" | "birthDay" | "birthMonth" | "birthYear" | "whatsappConsent" | "isActive"
>;

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** Prefixes ' to a cell that Excel or Sheets would run as a formula. Plain numbers, like +91 phones, are safe. */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

function escapeCell(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** RFC 4180 CSV with CRLF line endings */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(",") + "\r\n").join("");
}

/** DD-MM-YYYY, or DD-Mon (29-Feb) when the year is unknown. The importer must accept both. */
function csvDate({ birthDay, birthMonth, birthYear }: CsvEmployee): string {
  const day = String(birthDay).padStart(2, "0");
  return birthYear === null
    ? `${day}-${MONTH_NAMES[birthMonth - 1]}`
    : `${day}-${String(birthMonth).padStart(2, "0")}-${birthYear}`;
}

export function employeesToCsv(employees: readonly CsvEmployee[]): string {
  return toCsv([
    EMPLOYEE_CSV_HEADERS,
    ...employees.map((e) => [
      e.empCode ?? "",
      e.name,
      e.phone,
      csvDate(e),
      e.whatsappConsent ? "Yes" : "No",
      e.isActive ? "Yes" : "No",
    ]),
  ]);
}
