export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type CalendarDate = { year: number; month: number; day: number };

export function appTimeZone(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
}

/** The calendar date in the app time zone (Asia/Kolkata), never the server's local time. */
export function todayInTimeZone(timeZone: string = appTimeZone(), now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** YYYY-MM-DD */
export function toIsoDate({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The calendar date `days` later (or earlier, if negative) */
export function addDays({ year, month, day }: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
