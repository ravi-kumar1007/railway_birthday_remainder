import { describe, expect, it } from "vitest";
import { DEFAULT_EMPLOYEE_FILTERS, employeeFiltersQuery, parseEmployeeFilters } from "@/lib/employee-filters";

describe("parseEmployeeFilters", () => {
  it("defaults to active employees, any consent, page 1", () => {
    expect(parseEmployeeFilters({})).toEqual(DEFAULT_EMPLOYEE_FILTERS);
    expect(DEFAULT_EMPLOYEE_FILTERS).toEqual({ q: "", status: "active", consent: "all", page: 1 });
  });

  it("reads valid values and trims the search", () => {
    expect(parseEmployeeFilters({ q: "  priya ", status: "inactive", consent: "no", page: "3" })).toEqual({
      q: "priya",
      status: "inactive",
      consent: "no",
      page: 3,
    });
  });

  it("falls back to defaults for unknown or malformed values", () => {
    expect(parseEmployeeFilters({ status: "deleted", consent: "maybe", page: "-2" })).toEqual(DEFAULT_EMPLOYEE_FILTERS);
    expect(parseEmployeeFilters({ page: "1.5" }).page).toBe(1);
    expect(parseEmployeeFilters({ page: "abc" }).page).toBe(1);
  });

  it("uses the first value of repeated params and caps the search length", () => {
    expect(parseEmployeeFilters({ status: ["all", "inactive"], q: "x".repeat(500) })).toMatchObject({
      status: "all",
      q: "x".repeat(100),
    });
  });
});

describe("employeeFiltersQuery", () => {
  it("leaves out defaults", () => {
    expect(employeeFiltersQuery(DEFAULT_EMPLOYEE_FILTERS)).toBe("");
  });

  it("encodes the non-default filters", () => {
    expect(employeeFiltersQuery({ q: "ravi kumar", status: "all", consent: "yes", page: 2 })).toBe(
      "?q=ravi+kumar&status=all&consent=yes&page=2",
    );
  });
});
