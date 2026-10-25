import { describe, expect, it } from "vitest";
import { DEFAULT_LOG_FILTERS, logFiltersQuery, parseLogFilters } from "@/lib/log-filters";

describe("parseLogFilters", () => {
  it("defaults to every date and status, page 1", () => {
    expect(parseLogFilters({})).toEqual(DEFAULT_LOG_FILTERS);
    expect(DEFAULT_LOG_FILTERS).toEqual({ date: null, status: "all", page: 1 });
  });

  it("reads a valid date, status and page", () => {
    expect(parseLogFilters({ date: "2026-08-15", status: "failed", page: "2" })).toEqual({
      date: "2026-08-15",
      status: "failed",
      page: 2,
    });
  });

  it("ignores impossible dates and unknown statuses", () => {
    expect(parseLogFilters({ date: "2026-02-30", status: "lost", page: "0" })).toEqual(DEFAULT_LOG_FILTERS);
    expect(parseLogFilters({ date: "15-08-2026" }).date).toBeNull();
  });
});

describe("logFiltersQuery", () => {
  it("leaves out defaults", () => {
    expect(logFiltersQuery(DEFAULT_LOG_FILTERS)).toBe("");
    expect(logFiltersQuery({ date: "2026-08-15", status: "read", page: 3 })).toBe("?date=2026-08-15&status=read&page=3");
  });
});
