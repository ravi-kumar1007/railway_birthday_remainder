import "server-only";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { birthdayMonthDaysOn, daysUntilBirthday, upcomingBirthdayMonthDays } from "./birthday";
import { toIsoDate, type CalendarDate } from "./dates";

const { employees, sendLogs, cronRuns } = schema;

export const UPCOMING_DAYS = 30;

function birthdayOn(matches: { month: number; day: number }[]) {
  return or(...matches.map((match) => and(eq(employees.birthMonth, match.month), eq(employees.birthDay, match.day))));
}

export async function getDashboardStats(today: CalendarDate, timeZone: string) {
  const db = getDb();
  const active = eq(employees.isActive, true);
  const monthStart = toIsoDate({ ...today, day: 1 });

  const [[totals], [todays], upcomingRows, [lastRun], [lastCronRun], [failures]] = await Promise.all([
    db.select({ value: count() }).from(employees).where(active),
    db.select({ value: count() }).from(employees).where(and(active, birthdayOn(birthdayMonthDaysOn(today)))),
    db
      .select({
        id: employees.id,
        name: employees.name,
        birthDay: employees.birthDay,
        birthMonth: employees.birthMonth,
        whatsappConsent: employees.whatsappConsent,
      })
      .from(employees)
      .where(and(active, birthdayOn(upcomingBirthdayMonthDays(today, UPCOMING_DAYS)))),
    db.select().from(cronRuns).orderBy(desc(cronRuns.startedAt)).limit(1),
    db
      .select({ startedAt: cronRuns.startedAt })
      .from(cronRuns)
      .where(eq(cronRuns.source, "cron"))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1),
    // "This month" by the IST calendar, not the server's
    db
      .select({ value: count() })
      .from(sendLogs)
      .where(
        and(eq(sendLogs.status, "failed"), sql`(${sendLogs.createdAt} at time zone ${timeZone})::date >= ${monthStart}::date`),
      ),
  ]);

  const upcoming = upcomingRows
    .map((row) => ({ ...row, inDays: daysUntilBirthday({ day: row.birthDay, month: row.birthMonth }, today) }))
    .sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));

  return {
    activeEmployees: totals.value,
    birthdaysToday: todays.value,
    upcoming,
    lastRun: lastRun ?? null,
    lastCronRunAt: lastCronRun?.startedAt ?? null,
    failedThisMonth: failures.value,
  };
}
