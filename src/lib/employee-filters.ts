export type EmployeeFilters = {
  q: string;
  status: "active" | "inactive" | "all";
  consent: "yes" | "no" | "all";
  page: number;
};

export const DEFAULT_EMPLOYEE_FILTERS: EmployeeFilters = { q: "", status: "active", consent: "all", page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads the employee list filters from the URL. Anything unexpected falls back to the default. */
export function parseEmployeeFilters(params: SearchParams): EmployeeFilters {
  const status = first(params.status);
  const consent = first(params.consent);
  const page = Number(first(params.page));
  return {
    q: first(params.q).trim().slice(0, 100),
    status: status === "inactive" || status === "all" ? status : "active",
    consent: consent === "yes" || consent === "no" ? consent : "all",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

export function hasActiveFilters(filters: EmployeeFilters): boolean {
  return filters.q !== "" || filters.status !== "active" || filters.consent !== "all";
}

/** The list page's query string for these filters, leaving out defaults */
export function employeeFiltersQuery(filters: EmployeeFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== DEFAULT_EMPLOYEE_FILTERS.status) params.set("status", filters.status);
  if (filters.consent !== DEFAULT_EMPLOYEE_FILTERS.consent) params.set("consent", filters.consent);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
