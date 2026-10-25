import { describe, expect, it } from "vitest";
import { groupIntoLines, tableFromPdfLines } from "@/lib/import/pdf-text";

describe("groupIntoLines", () => {
  it("joins text on the same baseline, top to bottom and left to right, page by page", () => {
    const items = [
      { str: "9876543210", x: 200, y: 700, page: 1 },
      { str: "Priya Sharma", x: 50, y: 700.8, page: 1 },
      { str: "Employee list", x: 50, y: 750, page: 1 },
      { str: "Ravi", x: 50, y: 680, page: 1 },
      { str: "First on page 2", x: 50, y: 790, page: 2 },
    ];
    expect(groupIntoLines(items)).toEqual(["Employee list", "Priya Sharma 9876543210", "Ravi", "First on page 2"]);
  });
});

describe("tableFromPdfLines", () => {
  it("finds lines with a name, a phone and a date, and ignores the rest", () => {
    expect(
      tableFromPdfLines([
        "Acme Pvt Ltd - Employee birthdays",
        "S.No Name Mobile DOB",
        "1 Priya Sharma 98765 43210 15-08-1990",
        "2. E-102 Rahul Verma +91 91234 56789 02 Jan 1988",
        "Page 1 of 1",
      ]),
    ).toEqual({
      headers: ["Emp Code", "Name", "Phone", "Date of Birth"],
      rows: [
        ["", "Priya Sharma", "98765 43210", "15-08-1990"],
        ["E-102", "Rahul Verma", "+91 91234 56789", "02 Jan 1988"],
      ],
    });
  });

  it("leaves out the employee code column when no row has one", () => {
    expect(tableFromPdfLines(["Priya Sharma | 9876543210 | 1990-08-15"])).toEqual({
      headers: ["Name", "Phone", "Date of Birth"],
      rows: [["Priya Sharma", "9876543210", "1990-08-15"]],
    });
  });

  it("returns null when no line looks like an employee, as with a scanned PDF", () => {
    expect(tableFromPdfLines([])).toBeNull();
    expect(tableFromPdfLines(["Employee list", "Page 1 of 3"])).toBeNull();
  });
});
