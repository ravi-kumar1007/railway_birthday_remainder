import type { SendLog } from "@/db/schema";
import { parseDateInput } from "./birthday";

export const LOG_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const satisfies readonly SendLog["status"][];

export type LogFilters = {
  /** YYYY-MM-DD in IST: sends created that day */
  date: string | null;
  status: "all" | SendLog["status"];
  page: number;
};

export const DEFAULT_LOG_FILTERS: LogFilters = { date: null, status: "all", page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseLogFilters(params: SearchParams): LogFilters {
  const date = first(params.date);
  const status = first(params.status);
  const page = Number(first(params.page));
  return {
    date: parseDateInput(date) ? date : null,
    status: (LOG_STATUSES as readonly string[]).includes(status) ? (status as SendLog["status"]) : "all",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** The logs page's query string for these filters, leaving out defaults */
export function logFiltersQuery(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
