import "server-only";
import { and, asc, eq, like, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { birthdayMonthDaysOn } from "./birthday";
import { MAX_ATTEMPTS, UNKNOWN_OUTCOME, type BirthdayStore } from "./birthday-run";
import type { CalendarDate } from "./dates";
import { isUuid } from "./ids";
import { parseNameFormat } from "./names";

const { employees, sendLogs, templates, cronRuns, settings } = schema;

const MAX_ERROR_LENGTH = 500;

function birthdayOn(matches: { month: number; day: number }[]) {
  return or(...matches.map((match) => and(eq(employees.birthMonth, match.month), eq(employees.birthDay, match.day))));
}

/** The birthday job's database side. Each claim is one atomic statement; see BirthdayStore.claim. */
export const birthdayStore: BirthdayStore = {
  async startRun(runDate, source) {
    const [run] = await getDb().insert(cronRuns).values({ runDate, source }).returning({ id: cronRuns.id });
    return run.id;
  },

  async finishRun(runId, summary) {
    await getDb()
      .update(cronRuns)
      .set({
        finishedAt: new Date(),
        birthdaysFound: summary.birthdaysFound,
        sentCount: summary.sent,
        failedCount: summary.failed,
        skippedCount: summary.skipped,
        note: summary.note,
      })
      .where(eq(cronRuns.id, runId));
  },

  async findBirthdayEmployees(matches) {
    return getDb()
      .select({ id: employees.id, name: employees.name, phone: employees.phone })
      .from(employees)
      .where(and(eq(employees.isActive, true), eq(employees.whatsappConsent, true), birthdayOn(matches)));
  },

  async getActiveTemplate() {
    const [template] = await getDb()
      .select({
        id: templates.id,
        name: templates.name,
        language: templates.language,
        status: templates.status,
        bodyText: templates.bodyText,
      })
      .from(templates)
      .where(eq(templates.isActive, true))
      .limit(1);
    return template ?? null;
  },

  async getNameFormat() {
    const [row] = await getDb()
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "name_format"))
      .limit(1);
    return parseNameFormat(row?.value);
  },

  async claim(employeeId, year, templateId) {
    const db = getDb();
    const thisYear = and(eq(sendLogs.employeeId, employeeId), eq(sendLogs.sendYear, year));

    // First attempt: the unique (employee_id, send_year) constraint lets only one run insert
    const [created] = await db
      .insert(sendLogs)
      .values({ employeeId, sendYear: year, templateId, status: "queued", attempts: 1 })
      .onConflictDoNothing({ target: [sendLogs.employeeId, sendLogs.sendYear] })
      .returning({ id: sendLogs.id });
    if (created) return { logId: created.id, attempt: 1 };

    // Retry: only a failed row with attempts left, and only one run can flip it back to queued
    const [retry] = await db
      .update(sendLogs)
      // The previous attempt's id goes, so a late webhook about it can't touch this attempt
      .set({ status: "queued", attempts: sql`${sendLogs.attempts} + 1`, templateId, waMessageId: null })
      .where(and(thisYear, eq(sendLogs.status, "failed"), lt(sendLogs.attempts, MAX_ATTEMPTS)))
      .returning({ id: sendLogs.id, attempts: sendLogs.attempts });
    if (retry) return { logId: retry.id, attempt: retry.attempts };

    const [existing] = await db.select({ status: sendLogs.status }).from(sendLogs).where(thisYear).limit(1);
    if (existing?.status === "failed") return { skip: "gave_up" };
    if (!existing || existing.status === "queued") return { skip: "in_progress" };
    return { skip: "sent" };
  },

  async release(logId, attempt) {
    const db = getDb();
    const stillQueued = and(eq(sendLogs.id, logId), eq(sendLogs.status, "queued"));
    if (attempt === 1) await db.delete(sendLogs).where(stillQueued);
    else await db.update(sendLogs).set({ status: "failed", attempts: attempt - 1 }).where(stillQueued);
  },

  async markSent(logId, waMessageId) {
    await getDb()
      .update(sendLogs)
      .set({ status: "sent", waMessageId, errorCode: null, errorMessage: null })
      .where(eq(sendLogs.id, logId));
  },

  async markFailed(logId, code, message) {
    await getDb()
      .update(sendLogs)
      .set({ status: "failed", errorCode: code.slice(0, 50), errorMessage: message.slice(0, MAX_ERROR_LENGTH) })
      .where(eq(sendLogs.id, logId));
  },

  async markUnknown(logId, message) {
    await getDb()
      .update(sendLogs)
      .set({ errorMessage: `${UNKNOWN_OUTCOME} ${message}`.slice(0, MAX_ERROR_LENGTH) })
      .where(eq(sendLogs.id, logId));
  },

  async getLogForRetry(logId) {
    if (!isUuid(logId)) return null;
    const [row] = await getDb()
      .select({
        status: sendLogs.status,
        errorMessage: sendLogs.errorMessage,
        employee: {
          id: employees.id,
          name: employees.name,
          phone: employees.phone,
          isActive: employees.isActive,
          whatsappConsent: employees.whatsappConsent,
        },
      })
      .from(sendLogs)
      .innerJoin(employees, eq(employees.id, sendLogs.employeeId))
      .where(eq(sendLogs.id, logId))
      .limit(1);
    return row ?? null;
  },

  async claimManualRetry(logId) {
    const [row] = await getDb()
      .update(sendLogs)
      .set({ status: "queued", attempts: sql`${sendLogs.attempts} + 1`, errorCode: null, errorMessage: null, waMessageId: null })
      .where(
        and(
          eq(sendLogs.id, logId),
          or(
            eq(sendLogs.status, "failed"),
            and(eq(sendLogs.status, "queued"), like(sendLogs.errorMessage, `${UNKNOWN_OUTCOME}%`)),
          ),
        ),
      )
      .returning({ attempts: sendLogs.attempts });
    return row?.attempts ?? null;
  },
};

/** Everyone with a birthday today, with this year's send status, for the dashboard */
export async function listTodaysBirthdays(today: CalendarDate) {
  return getDb()
    .select({
      id: employees.id,
      name: employees.name,
      phone: employees.phone,
      whatsappConsent: employees.whatsappConsent,
      status: sendLogs.status,
      attempts: sendLogs.attempts,
      errorMessage: sendLogs.errorMessage,
    })
    .from(employees)
    .leftJoin(sendLogs, and(eq(sendLogs.employeeId, employees.id), eq(sendLogs.sendYear, today.year)))
    .where(and(eq(employees.isActive, true), birthdayOn(birthdayMonthDaysOn(today))))
    .orderBy(asc(employees.name));
}
