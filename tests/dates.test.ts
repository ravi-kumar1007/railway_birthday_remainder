import { describe, expect, it } from "vitest";
import { addDays, todayInTimeZone, toIsoDate } from "@/lib/dates";

const IST = "Asia/Kolkata";

describe("todayInTimeZone (IST today)", () => {
  it("rolls over to the next day at 18:30 UTC, which is midnight IST", () => {
    expect(todayInTimeZone(IST, new Date("2026-03-14T18:29:59Z"))).toEqual({ year: 2026, month: 3, day: 14 });
    expect(todayInTimeZone(IST, new Date("2026-03-14T18:30:00Z"))).toEqual({ year: 2026, month: 3, day: 15 });
  });

  it("is still the previous IST day just before midnight IST, whatever the server's zone", () => {
    // 23:59 IST on 31 Dec is 18:29 UTC
    expect(todayInTimeZone(IST, new Date("2026-12-31T18:29:00Z"))).toEqual({ year: 2026, month: 12, day: 31 });
    expect(todayInTimeZone(IST, new Date("2026-12-31T18:31:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("returns IST noon on the same calendar day as UTC 06:30", () => {
    expect(todayInTimeZone(IST, new Date("2026-02-28T06:30:00Z"))).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("defaults to Asia/Kolkata when APP_TIMEZONE is unset", () => {
    const previous = process.env.APP_TIMEZONE;
    delete process.env.APP_TIMEZONE;
    try {
      expect(todayInTimeZone(undefined, new Date("2026-07-01T20:00:00Z"))).toEqual({ year: 2026, month: 7, day: 2 });
    } finally {
      if (previous !== undefined) process.env.APP_TIMEZONE = previous;
    }
  });
});

describe("toIsoDate", () => {
  it("zero-pads month and day", () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
  });
});

describe("addDays", () => {
  it("moves across month, year and leap-day boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addDays({ year: 2027, month: 3, day: 1 }, -1)).toEqual({ year: 2027, month: 2, day: 28 });
  });
});
