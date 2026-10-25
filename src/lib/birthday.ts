import { toIsoDate, type CalendarDate } from "./dates";

/** A birthday as stored on an employee. The year is optional. */
export type Birthday = { day: number; month: number; year: number | null };

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// A leap year, so a 29 Feb birthday with no known year still fits in a date input
const UNKNOWN_YEAR = 2000;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isValidBirthday({ day, month, year }: Birthday): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) return false;
  const max = month === 2 && isLeapYear(year ?? UNKNOWN_YEAR) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= max;
}

/** The birthdays (day and month) celebrated on `date`: 29 Feb ones move to 28 Feb in non-leap years. */
export function birthdayMonthDaysOn(date: CalendarDate): { month: number; day: number }[] {
  const matches = [{ month: date.month, day: date.day }];
  if (date.month === 2 && date.day === 28 && !isLeapYear(date.year)) matches.push({ month: 2, day: 29 });
  return matches;
}

export function isBirthdayOn(birthday: Pick<Birthday, "day" | "month">, date: CalendarDate): boolean {
  return birthdayMonthDaysOn(date).some((match) => match.month === birthday.month && match.day === birthday.day);
}

/** Parses the YYYY-MM-DD value of an <input type="date">. */
export function parseDateInput(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return isValidBirthday({ day, month, year }) ? { year, month, day } : null;
}

export function toDateInputValue({ day, month, year }: Birthday): string {
  return toIsoDate({ year: year ?? UNKNOWN_YEAR, month, day });
}

/** 15 Aug 1990, or 15 Aug when the year is unknown */
export function formatBirthday({ day, month, year }: Birthday): string {
  return `${day} ${MONTH_NAMES[month - 1]}${year === null ? "" : ` ${year}`}`;
}
