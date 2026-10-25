import { describe, expect, it } from "vitest";
import type { ImportRow } from "@/lib/employee-schema";
import { planImport, type SavedEmployee } from "@/lib/import/plan";

const PHONE = "+919876543210";
const OTHER_PHONE = "+919123456789";

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { name: "Priya Sharma", phone: PHONE, empCode: "E-1", birthDay: 15, birthMonth: 8, birthYear: 1990, whatsappConsent: true, ...overrides };
}

function saved(overrides: Partial<SavedEmployee> = {}): SavedEmployee {
  return { id: "a", name: "Priya Sharma", phone: PHONE, empCode: "E-1", birthDay: 15, birthMonth: 8, birthYear: 1990, whatsappConsent: true, ...overrides };
}

const rows = (...data: ImportRow[]) => data.map((d, index) => ({ index, data: d }));

describe("planImport", () => {
  it("inserts people who aren't saved yet, with consent defaulting to no", () => {
    const plan = planImport(rows(row({ whatsappConsent: null })), [], "upsert");
    expect(plan.inserts).toEqual([
      { name: "Priya Sharma", phone: PHONE, empCode: "E-1", birthDay: 15, birthMonth: 8, birthYear: 1990, whatsappConsent: false },
    ]);
    expect(plan.updates).toEqual([]);
  });

  it("matches by employee code first, then by phone", () => {
    const byCode = planImport(rows(row({ name: "Priya S", phone: OTHER_PHONE })), [saved()], "upsert");
    expect(byCode.updates).toEqual([{ id: "a", set: expect.objectContaining({ name: "Priya S", phone: OTHER_PHONE }) }]);

    const byPhone = planImport(rows(row({ name: "Priya S", empCode: null })), [saved()], "upsert");
    expect(byPhone.updates).toEqual([{ id: "a", set: expect.objectContaining({ name: "Priya S" }) }]);
  });

  it("skips people who are already saved in 'add new only' mode", () => {
    const plan = planImport(rows(row({ name: "Changed" }), row({ empCode: "E-2", phone: OTHER_PHONE })), [saved()], "insert");
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skipped).toEqual([{ index: 0, reason: expect.stringMatching(/already saved/i) }]);
  });

  it("keeps the saved consent, employee code and birth year when the file leaves them blank", () => {
    const plan = planImport(rows(row({ name: "Priya S", empCode: null, whatsappConsent: null, birthYear: null })), [saved()], "upsert");
    expect(plan.updates).toEqual([
      { id: "a", set: { name: "Priya S", phone: PHONE, birthDay: 15, birthMonth: 8, birthYear: 1990 } },
    ]);
  });

  it("counts rows that would change nothing as unchanged", () => {
    expect(planImport(rows(row()), [saved()], "upsert")).toEqual({ inserts: [], updates: [], unchanged: 1, skipped: [] });
  });

  it("skips a row whose phone belongs to a different employee", () => {
    const plan = planImport(
      rows(row({ phone: OTHER_PHONE })),
      [saved(), saved({ id: "b", name: "Ravi Kumar", phone: OTHER_PHONE, empCode: "E-2" })],
      "upsert",
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ index: 0, reason: expect.stringContaining("Ravi Kumar") }]);
  });

  it("skips a phone match whose saved employee code is different", () => {
    const plan = planImport(rows(row({ empCode: "E-9" })), [saved()], "upsert");
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ index: 0, reason: expect.stringContaining("E-1") }]);
  });

  it("skips repeats within the batch", () => {
    const plan = planImport(
      rows(row({ empCode: "E-5", phone: OTHER_PHONE }), row({ empCode: "E-6", phone: OTHER_PHONE }), row(), row({ empCode: null })),
      [saved()],
      "upsert",
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.unchanged).toBe(1);
    expect(plan.skipped).toEqual([
      { index: 1, reason: expect.stringMatching(/earlier row/) },
      { index: 3, reason: expect.stringMatching(/earlier row/) },
    ]);
  });
});
