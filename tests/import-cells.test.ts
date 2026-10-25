import { describe, expect, it } from "vitest";
import { birthdayFromCell, cellText, consentFromCell, phoneFromCell } from "@/lib/import/cells";

const date = (day: number, month: number, year: number | null) => ({ ok: true, value: { day, month, year } });

describe("birthdayFromCell (date parsing)", () => {
  it("reads Excel serial numbers", () => {
    expect(birthdayFromCell(33100)).toEqual(date(15, 8, 1990));
    // A time of day is ignored
    expect(birthdayFromCell(33100.75)).toEqual(date(15, 8, 1990));
    // A serial that arrived as CSV text
    expect(birthdayFromCell("33100")).toEqual(date(15, 8, 1990));
  });

  it("reads serials from workbooks that use the 1904 date system", () => {
    expect(birthdayFromCell(31638, { date1904: true })).toEqual(date(15, 8, 1990));
  });

  it("reads DD-MM-YYYY, DD/MM/YYYY and DD.MM.YYYY", () => {
    for (const input of ["15-08-1990", "15/08/1990", "15.08.1990", "15/8/1990", " 15-08-1990 ", "15/08/1990 00:00"]) {
      expect(birthdayFromCell(input), input).toEqual(date(15, 8, 1990));
    }
  });

  it("treats ambiguous dates as DD/MM, the Indian order", () => {
    expect(birthdayFromCell("03/04/1990")).toEqual(date(3, 4, 1990));
  });

  it("accepts an MM/DD date when it can't be DD/MM", () => {
    expect(birthdayFromCell("08/15/1990")).toEqual(date(15, 8, 1990));
  });

  it("reads DD-MMM-YYYY in common spellings", () => {
    for (const input of ["15-Aug-1990", "15 Aug 1990", "15-AUG-1990", "15 August 1990", "15th Aug, 1990", "Aug 15, 1990"]) {
      expect(birthdayFromCell(input), input).toEqual(date(15, 8, 1990));
    }
    expect(birthdayFromCell("1 Sept 1990")).toEqual(date(1, 9, 1990));
  });

  it("reads YYYY-MM-DD, with or without a time", () => {
    for (const input of ["1990-08-15", "1990-08-15 00:00:00", "1990-08-15T00:00:00.000Z"]) {
      expect(birthdayFromCell(input), input).toEqual(date(15, 8, 1990));
    }
  });

  it("reads a day and month without a year, as the CSV export writes them", () => {
    expect(birthdayFromCell("29-Feb")).toEqual(date(29, 2, null));
    expect(birthdayFromCell("15 Aug")).toEqual(date(15, 8, null));
  });

  it("asks for a 4-digit year", () => {
    expect(birthdayFromCell("15-08-90")).toEqual({ ok: false, error: expect.stringMatching(/4-digit year/) });
  });

  it("rejects missing values, impossible dates and other text", () => {
    expect(birthdayFromCell(null)).toEqual({ ok: false, error: expect.stringMatching(/missing/i) });
    for (const input of ["31-04-1990", "29-02-1991", "32-01-1990", "13/13/1990", "15-Augx-1990", "next week", "1990", 0, 60]) {
      expect(birthdayFromCell(input).ok, String(input)).toBe(false);
    }
  });
});

describe("phoneFromCell", () => {
  const ok = { ok: true, value: "+919876543210" };

  it("reads numbers stored as numbers or as text", () => {
    expect(phoneFromCell(9876543210)).toEqual(ok);
    expect(phoneFromCell(919876543210)).toEqual(ok);
    expect(phoneFromCell("98765 43210")).toEqual(ok);
    expect(phoneFromCell("9876543210.0")).toEqual(ok);
  });

  it("drops the ' the CSV export adds to stop spreadsheets running a cell as a formula", () => {
    expect(phoneFromCell("'+91 98765 43210")).toEqual(ok);
    expect(cellText("'=Priya")).toBe("=Priya");
    expect(cellText("O'Brien")).toBe("O'Brien");
  });

  it("explains numbers Excel has shortened to scientific notation", () => {
    expect(phoneFromCell("9.19877E+11")).toEqual({ ok: false, error: expect.stringMatching(/Text/) });
  });

  it("passes on normalization errors", () => {
    expect(phoneFromCell("12345").ok).toBe(false);
    expect(phoneFromCell(null)).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
  });
});

describe("consentFromCell", () => {
  it("reads yes/no style answers", () => {
    for (const value of ["Yes", "y", "TRUE", "1", "Agreed", true, 1]) {
      expect(consentFromCell(value), String(value)).toEqual({ ok: true, value: true });
    }
    for (const value of ["No", "n", "false", "0", false, 0]) {
      expect(consentFromCell(value), String(value)).toEqual({ ok: true, value: false });
    }
  });

  it("treats a blank cell as unknown", () => {
    for (const value of ["", "  ", null]) expect(consentFromCell(value)).toEqual({ ok: true, value: null });
  });

  it("rejects anything else", () => {
    expect(consentFromCell("maybe").ok).toBe(false);
  });
});
