import { formatBirthday } from "../birthday";
import { importRowSchema, type ImportRow } from "../employee-schema";
import { formatPhone } from "../phone";
import { birthdayFromCell, cellText, consentFromCell, phoneFromCell, type Cell } from "./cells";
import { findHeaderRow, type ColumnMapping } from "./columns";

export type ImportTable = {
  headers: string[];
  rows: Cell[][];
  /** Spreadsheet row number of rows[0], for messages like "row 12" */
  firstRowNumber: number;
};

export function sheetToTable(sheet: readonly (readonly Cell[])[]): ImportTable {
  const headerIndex = findHeaderRow(sheet);
  return {
    headers: (sheet[headerIndex] ?? []).map((cell) => cellText(cell)),
    rows: sheet.slice(headerIndex + 1).map((row) => [...row]),
    firstRowNumber: headerIndex + 2,
  };
}

export type PreviewStatus = "valid" | "error" | "duplicate";

export type PreviewRow = {
  line: number;
  status: PreviewStatus;
  // What the table shows: cleaned-up values where they could be read, the raw text otherwise
  name: string;
  phone: string;
  birthday: string;
  empCode: string;
  consent: string;
  /** Reasons for an error or duplicate */
  issues: string[];
  /** For valid rows, exactly what is sent to the server */
  data?: ImportRow;
};

export function buildPreview(table: ImportTable, mapping: ColumnMapping, { date1904 = false } = {}): PreviewRow[] {
  const preview: PreviewRow[] = [];
  const phoneLines = new Map<string, number>();
  const codeLines = new Map<string, number>();
  const cellOf = (row: Cell[], column: number | null): Cell => (column === null ? null : (row[column] ?? null));

  table.rows.forEach((row, offset) => {
    const cells = {
      name: cellOf(row, mapping.name),
      phone: cellOf(row, mapping.phone),
      birthday: cellOf(row, mapping.birthday),
      empCode: cellOf(row, mapping.empCode),
      consent: cellOf(row, mapping.consent),
    };
    if (Object.values(cells).every((cell) => cellText(cell) === "")) return;

    const issues: string[] = [];
    const name = cellText(cells.name);
    if (!name) issues.push("Name is missing.");
    const phone = phoneFromCell(cells.phone);
    if (!phone.ok) issues.push(phone.error);
    const birthday = birthdayFromCell(cells.birthday, { date1904 });
    if (!birthday.ok) issues.push(birthday.error);
    const consent = consentFromCell(cells.consent);
    if (!consent.ok) issues.push(consent.error);

    const line = table.firstRowNumber + offset;
    const shown: PreviewRow = {
      line,
      status: "error",
      name,
      phone: phone.ok ? formatPhone(phone.value) : cellText(cells.phone),
      birthday: birthday.ok ? formatBirthday(birthday.value) : cellText(cells.birthday),
      empCode: cellText(cells.empCode),
      consent: consent.ok ? (consent.value === null ? "" : consent.value ? "Yes" : "No") : cellText(cells.consent),
      issues,
    };

    if (phone.ok && birthday.ok && consent.ok) {
      // The same schema the server uses, so a row that passes here passes there
      const parsed = importRowSchema.safeParse({
        name,
        phone: phone.value,
        empCode: shown.empCode,
        birthDay: birthday.value.day,
        birthMonth: birthday.value.month,
        birthYear: birthday.value.year,
        whatsappConsent: consent.value,
      });
      if (parsed.success && issues.length === 0) {
        const data = parsed.data;
        const samePhone = phoneLines.get(data.phone);
        const sameCode = data.empCode === null ? undefined : codeLines.get(data.empCode);
        if (samePhone !== undefined) {
          preview.push({ ...shown, status: "duplicate", issues: [`Same phone as row ${samePhone}.`] });
        } else if (sameCode !== undefined) {
          preview.push({ ...shown, status: "duplicate", issues: [`Same employee code as row ${sameCode}.`] });
        } else {
          phoneLines.set(data.phone, line);
          if (data.empCode !== null) codeLines.set(data.empCode, line);
          preview.push({ ...shown, status: "valid", name: data.name, data });
        }
        return;
      }
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          if (!issues.includes(issue.message) && !(issue.path[0] === "name" && !name)) issues.push(issue.message);
        }
      }
    }
    preview.push(shown);
  });

  return preview;
}
