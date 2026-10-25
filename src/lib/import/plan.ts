import type { Employee, NewEmployee } from "@/db/schema";
import type { ImportRow } from "../employee-schema";

/** Rows per request. The browser sends a large file in chunks of this size. */
export const IMPORT_CHUNK_SIZE = 500;

/** upsert: add new people and update existing ones. insert: add new people only. */
export type ImportMode = "upsert" | "insert";

export type SavedEmployee = Pick<
  Employee,
  "id" | "name" | "phone" | "empCode" | "birthDay" | "birthMonth" | "birthYear" | "whatsappConsent"
>;

type EmployeeChanges = Partial<
  Pick<NewEmployee, "name" | "phone" | "empCode" | "birthDay" | "birthMonth" | "birthYear" | "whatsappConsent">
>;

/** What POST /api/admin/employees/import answers for one chunk. Skipped indexes are positions in the chunk. */
export type ImportChunkResult =
  | { inserted: number; updated: number; unchanged: number; skipped: { index: number; reason: string }[] }
  | { error: string };

export type ImportPlan = {
  inserts: NewEmployee[];
  updates: { id: string; set: EmployeeChanges }[];
  unchanged: number;
  skipped: { index: number; reason: string }[];
};

function changesFor(data: ImportRow, match: SavedEmployee): EmployeeChanges {
  const sameDay = data.birthDay === match.birthDay && data.birthMonth === match.birthMonth;
  return {
    name: data.name,
    phone: data.phone,
    birthDay: data.birthDay,
    birthMonth: data.birthMonth,
    // A file without the year doesn't erase a year already saved for the same birthday
    birthYear: data.birthYear ?? (sameDay ? match.birthYear : null),
    // Blank in the file: keep what is saved
    ...(data.empCode !== null && { empCode: data.empCode }),
    ...(data.whatsappConsent !== null && { whatsappConsent: data.whatsappConsent }),
  };
}

/**
 * Decides what to do with each valid row, given the saved employees that share a phone or code
 * with any of them. A row matches an employee by employee code first, then by phone. Pure, so the
 * merge rules are testable without a database.
 */
export function planImport(
  rows: readonly { index: number; data: ImportRow }[],
  saved: readonly SavedEmployee[],
  mode: ImportMode,
): ImportPlan {
  const byCode = new Map(saved.filter((e) => e.empCode !== null).map((e) => [e.empCode!, e]));
  const byPhone = new Map(saved.map((e) => [e.phone, e]));
  const plan: ImportPlan = { inserts: [], updates: [], unchanged: 0, skipped: [] };

  const seenPhones = new Set<string>();
  const seenCodes = new Set<string>();
  const seenEmployees = new Set<string>();

  for (const { index, data } of rows) {
    const skip = (reason: string) => plan.skipped.push({ index, reason });
    const match = (data.empCode !== null ? byCode.get(data.empCode) : undefined) ?? byPhone.get(data.phone);

    if (
      seenPhones.has(data.phone) ||
      (data.empCode !== null && seenCodes.has(data.empCode)) ||
      (match && seenEmployees.has(match.id))
    ) {
      skip("Same person as an earlier row in this file.");
      continue;
    }
    seenPhones.add(data.phone);
    if (data.empCode !== null) seenCodes.add(data.empCode);
    if (match) seenEmployees.add(match.id);

    if (!match) {
      plan.inserts.push({
        name: data.name,
        phone: data.phone,
        empCode: data.empCode,
        birthDay: data.birthDay,
        birthMonth: data.birthMonth,
        birthYear: data.birthYear,
        whatsappConsent: data.whatsappConsent ?? false,
      });
      continue;
    }

    if (mode === "insert") {
      skip(`Already saved as ${match.name}.`);
      continue;
    }

    const phoneOwner = byPhone.get(data.phone);
    if (phoneOwner && phoneOwner.id !== match.id) {
      skip(`This phone number belongs to ${phoneOwner.name}.`);
      continue;
    }
    if (data.empCode !== null && match.empCode !== null && match.empCode !== data.empCode) {
      skip(`${match.name} has this phone number but employee code ${match.empCode}.`);
      continue;
    }

    const set = changesFor(data, match);
    const changed = (Object.keys(set) as (keyof EmployeeChanges)[]).some((key) => set[key] !== match[key]);
    if (changed) plan.updates.push({ id: match.id, set });
    else plan.unchanged++;
  }

  return plan;
}
