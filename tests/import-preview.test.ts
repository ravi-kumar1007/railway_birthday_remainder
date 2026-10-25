import { describe, expect, it } from "vitest";
import { detectColumns } from "@/lib/import/columns";
import { buildPreview, sheetToTable } from "@/lib/import/preview";

describe("buildPreview", () => {
  const table = sheetToTable([
    ["Emp Code", "Name", "Phone", "Date of Birth", "WhatsApp Consent"],
    ["E-1", "Priya Sharma", 9876543210, "15-08-1990", "Yes"],
    ["", "", "", "", ""],
    ["E-2", "Rahul", "12345", "31-04-1990", "maybe"],
    ["E-3", "Priya Again", "+91 98765 43210", "01-01-1991", ""],
    ["E-1", "Someone Else", "9123456789", "02-02-1992", "No"],
    [null, "  Ravi  Kumar ", "9988776655", 33100, null],
    ["E-9", "", "9000000001", "01-01-1990", ""],
  ]);
  const rows = buildPreview(table, detectColumns(table.headers));

  it("numbers rows as the spreadsheet does and skips blank rows", () => {
    expect(rows.map((row) => row.line)).toEqual([2, 4, 5, 6, 7, 8]);
  });

  it("turns valid rows into exactly what the server receives", () => {
    expect(rows[0]).toMatchObject({
      status: "valid",
      birthday: "15 Aug 1990",
      data: {
        name: "Priya Sharma",
        phone: "+919876543210",
        empCode: "E-1",
        birthDay: 15,
        birthMonth: 8,
        birthYear: 1990,
        whatsappConsent: true,
      },
    });
    expect(rows[4]).toMatchObject({
      status: "valid",
      data: { name: "Ravi Kumar", empCode: null, whatsappConsent: null, birthDay: 15, birthMonth: 8, birthYear: 1990 },
    });
  });

  it("lists every problem with a row", () => {
    expect(rows[1].status).toBe("error");
    expect(rows[1].issues).toHaveLength(3);
    expect(rows[5]).toMatchObject({ status: "error", issues: ["Name is missing."] });
  });

  it("flags a repeated phone or employee code as a duplicate of the earlier row", () => {
    expect(rows[2]).toMatchObject({ status: "duplicate", issues: ["Same phone as row 2."] });
    expect(rows[3]).toMatchObject({ status: "duplicate", issues: ["Same employee code as row 2."] });
  });

  it("works without the optional columns", () => {
    const minimal = sheetToTable([["Name", "Mobile", "DOB"], ["Priya", "9876543210", "15/08/1990"]]);
    expect(buildPreview(minimal, detectColumns(minimal.headers))).toMatchObject([
      { status: "valid", data: { empCode: null, whatsappConsent: null } },
    ]);
  });
});
