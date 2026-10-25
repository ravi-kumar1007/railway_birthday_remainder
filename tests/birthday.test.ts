import { describe, expect, it } from "vitest";
import {
  birthdayMonthDaysOn,
  formatBirthday,
  isBirthdayOn,
  isValidBirthday,
  parseDateInput,
  toDateInputValue,
} from "@/lib/birthday";

describe("isValidBirthday", () => {
  it("accepts real calendar dates", () => {
    expect(isValidBirthday({ day: 31, month: 12, year: 1990 })).toBe(true);
    expect(isValidBirthday({ day: 1, month: 1, year: null })).toBe(true);
  });

  it("rejects impossible dates", () => {
    expect(isValidBirthday({ day: 31, month: 4, year: 1990 })).toBe(false);
    expect(isValidBirthday({ day: 30, month: 2, year: null })).toBe(false);
    expect(isValidBirthday({ day: 0, month: 5, year: 1990 })).toBe(false);
    expect(isValidBirthday({ day: 10, month: 13, year: 1990 })).toBe(false);
    expect(isValidBirthday({ day: 1.5, month: 5, year: 1990 })).toBe(false);
  });

  it("allows 29 Feb only in leap years, or when the year is unknown", () => {
    expect(isValidBirthday({ day: 29, month: 2, year: 2000 })).toBe(true);
    expect(isValidBirthday({ day: 29, month: 2, year: 1996 })).toBe(true);
    expect(isValidBirthday({ day: 29, month: 2, year: 1900 })).toBe(false);
    expect(isValidBirthday({ day: 29, month: 2, year: 1995 })).toBe(false);
    expect(isValidBirthday({ day: 29, month: 2, year: null })).toBe(true);
  });
});

describe("isBirthdayOn (Feb 29)", () => {
  it("matches the same day and month in any year", () => {
    expect(isBirthdayOn({ day: 15, month: 8 }, { year: 2026, month: 8, day: 15 })).toBe(true);
    expect(isBirthdayOn({ day: 15, month: 8 }, { year: 2026, month: 8, day: 16 })).toBe(false);
  });

  it("celebrates 29 Feb birthdays on 28 Feb in non-leap years", () => {
    const leapling = { day: 29, month: 2 };
    expect(isBirthdayOn(leapling, { year: 2026, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayOn(leapling, { year: 2026, month: 3, day: 1 })).toBe(false);
    expect(isBirthdayOn(leapling, { year: 2028, month: 2, day: 28 })).toBe(false);
    expect(isBirthdayOn(leapling, { year: 2028, month: 2, day: 29 })).toBe(true);
    expect(isBirthdayOn(leapling, { year: 2100, month: 2, day: 28 })).toBe(true);
  });

  it("does not move 28 Feb birthdays in leap years", () => {
    const feb28 = { day: 28, month: 2 };
    expect(isBirthdayOn(feb28, { year: 2028, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayOn(feb28, { year: 2028, month: 2, day: 29 })).toBe(false);
  });
});

describe("parseDateInput", () => {
  it("reads the YYYY-MM-DD value of a date input", () => {
    expect(parseDateInput("1990-08-15")).toEqual({ year: 1990, month: 8, day: 15 });
  });

  it("rejects other formats and impossible dates", () => {
    for (const input of ["", "15/08/1990", "1990-8-15", "1990-02-30", "1995-02-29"]) {
      expect(parseDateInput(input), input).toBeNull();
    }
  });
});

describe("toDateInputValue", () => {
  it("formats a birthday for a date input", () => {
    expect(toDateInputValue({ day: 5, month: 8, year: 1990 })).toBe("1990-08-05");
  });

  it("uses leap year 2000 when the year is unknown, so 29 Feb stays valid", () => {
    expect(toDateInputValue({ day: 29, month: 2, year: null })).toBe("2000-02-29");
  });
});

describe("formatBirthday", () => {
  it("shows the year only when it is known", () => {
    expect(formatBirthday({ day: 15, month: 8, year: 1990 })).toBe("15 Aug 1990");
    expect(formatBirthday({ day: 29, month: 2, year: null })).toBe("29 Feb");
  });
});

describe("birthdayMonthDaysOn (Feb 29)", () => {
  it("is just today's day and month on ordinary days", () => {
    expect(birthdayMonthDaysOn({ year: 2026, month: 8, day: 15 })).toEqual([{ month: 8, day: 15 }]);
  });

  it("adds 29 Feb on 28 Feb in non-leap years only", () => {
    expect(birthdayMonthDaysOn({ year: 2026, month: 2, day: 28 })).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
    expect(birthdayMonthDaysOn({ year: 2028, month: 2, day: 28 })).toEqual([{ month: 2, day: 28 }]);
    expect(birthdayMonthDaysOn({ year: 2028, month: 2, day: 29 })).toEqual([{ month: 2, day: 29 }]);
  });
});
