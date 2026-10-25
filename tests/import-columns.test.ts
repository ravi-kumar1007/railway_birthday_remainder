import { describe, expect, it } from "vitest";
import { detectColumns, findHeaderRow } from "@/lib/import/columns";

describe("detectColumns", () => {
  it("finds the headers used by the sample file and the CSV export", () => {
    expect(detectColumns(["Emp Code", "Name", "Phone", "Date of Birth", "WhatsApp Consent", "Active"])).toEqual({
      empCode: 0,
      name: 1,
      phone: 2,
      birthday: 3,
      consent: 4,
    });
  });

  it("recognises common variations", () => {
    expect(detectColumns(["S.No", "Employee Name", "Mobile No.", "DOB (DD-MM-YYYY)", "Employee ID"])).toEqual({
      name: 1,
      phone: 2,
      birthday: 3,
      empCode: 4,
      consent: null,
    });
    expect(detectColumns(["ID", "Full Name", "WhatsApp Number", "Birthday"])).toMatchObject({
      empCode: 0,
      name: 1,
      phone: 2,
      birthday: 3,
    });
  });

  it("leaves fields unmapped when no header matches", () => {
    expect(detectColumns(["Department", "Email"])).toEqual({
      name: null,
      phone: null,
      birthday: null,
      empCode: null,
      consent: null,
    });
  });
});

describe("findHeaderRow", () => {
  it("skips title rows above the headers", () => {
    expect(findHeaderRow([["Acme employee list"], [], ["Name", "Phone", "DOB"], ["Priya", "9876543210", "15-08-1990"]])).toBe(2);
  });

  it("falls back to the first row with several cells", () => {
    expect(findHeaderRow([["Title"], ["a", "b"], ["c", "d"]])).toBe(1);
    expect(findHeaderRow([])).toBe(0);
  });
});
