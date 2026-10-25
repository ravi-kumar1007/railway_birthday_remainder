import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { LogFilters } from "./log-filters";

const { sendLogs, employees, templates } = schema;

export const LOGS_PAGE_SIZE = 50;

export async function listSendLogs(filters: LogFilters, timeZone: string) {
  const db = getDb();
  const where = and(
    filters.status === "all" ? undefined : eq(sendLogs.status, filters.status),
    // The date picked is an IST calendar date
    filters.date ? sql`(${sendLogs.createdAt} at time zone ${timeZone})::date = ${filters.date}::date` : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: sendLogs.id,
        createdAt: sendLogs.createdAt,
        updatedAt: sendLogs.updatedAt,
        status: sendLogs.status,
        attempts: sendLogs.attempts,
        errorCode: sendLogs.errorCode,
        errorMessage: sendLogs.errorMessage,
        employeeName: employees.name,
        employeePhone: employees.phone,
        templateName: templates.name,
      })
      .from(sendLogs)
      .innerJoin(employees, eq(employees.id, sendLogs.employeeId))
      .leftJoin(templates, eq(templates.id, sendLogs.templateId))
      .where(where)
      .orderBy(desc(sendLogs.createdAt), desc(sendLogs.id))
      .limit(LOGS_PAGE_SIZE)
      .offset((filters.page - 1) * LOGS_PAGE_SIZE),
    db.select({ total: count() }).from(sendLogs).where(where),
  ]);
  return { rows, total };
}
