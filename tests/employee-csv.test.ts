import { describe, expect, it } from "vitest";
import { EMPLOYEE_CSV_HEADERS, employeesToCsv, toCsv } from "@/lib/employee-csv";

describe("toCsv", () => {
  it("quotes fields containing commas, quotes or line breaks", () => {
    expect(toCsv([["a,b", 'say "hi"', "line1\nline2", "plain"]])).toBe(
      '"a,b","say ""hi""","line1\nline2",plain\r\n',
    );
  });

  it("neutralizes cells a spreadsheet would run as a formula", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "@SUM(A1)", "-2+3", "+cmd", "\t=1"]])).toBe(
      "\"'=HYPERLINK(\"\"x\"\")\",'@SUM(A1),'-2+3,'+cmd,'\t=1\r\n",
    );
  });

  it("leaves plain numbers, including +country-code phones, untouched", () => {
    expect(toCsv([["+919876543210", "-5", "42"]])).toBe("+919876543210,-5,42\r\n");
  });
});

describe("employeesToCsv", () => {
  const base = {
    empCode: "E-101",
    name: "Priya Sharma",
    phone: "+919876543210",
    birthDay: 5,
    birthMonth: 8,
    birthYear: 1990,
    whatsappConsent: true,
    isActive: true,
  };

  it("writes the import headers, then one row per employee", () => {
    const csv = employeesToCsv([
      base,
      { ...base, empCode: null, name: "Ravi", phone: "+447911123456", birthDay: 29, birthMonth: 2, birthYear: null, whatsappConsent: false, isActive: false },
    ]);
    expect(csv.split("\r\n")).toEqual([
      EMPLOYEE_CSV_HEADERS.join(","),
      "E-101,Priya Sharma,+919876543210,05-08-1990,Yes,Yes",
      ",Ravi,+447911123456,29-Feb,No,No",
      "",
    ]);
  });

  it("uses headers the importer recognises", () => {
    expect(EMPLOYEE_CSV_HEADERS).toEqual(["Emp Code", "Name", "Phone", "Date of Birth", "WhatsApp Consent", "Active"]);
  });
});
