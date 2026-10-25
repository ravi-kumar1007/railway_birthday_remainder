import "server-only";
import { and, asc, count, eq, ilike, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { EmployeeFilters } from "./employee-filters";

const { employees } = schema;

export const EMPLOYEES_PAGE_SIZE = 25;

const byName = [asc(sql`lower(${employees.name})`), asc(employees.id)];

export function isEmployeeId(id: unknown): id is string {
  return z.uuid().safeParse(id).success;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function filterWhere({ q, status, consent }: EmployeeFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (status !== "all") conditions.push(eq(employees.isActive, status === "active"));
  if (consent !== "all") conditions.push(eq(employees.whatsappConsent, consent === "yes"));
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    conditions.push(
      or(
        ilike(employees.name, pattern),
        ilike(employees.empCode, pattern),
        // Phones are stored as +919876543210, so "98765 43210" is matched on its digits
        digits.length >= 3 ? like(employees.phone, `%${digits}%`) : undefined,
      ),
    );
  }
  return and(...conditions);
}

export async function listEmployees(filters: EmployeeFilters) {
  const db = getDb();
  const where = filterWhere(filters);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(employees)
      .where(where)
      .orderBy(...byName)
      .limit(EMPLOYEES_PAGE_SIZE)
      .offset((filters.page - 1) * EMPLOYEES_PAGE_SIZE),
    db.select({ total: count() }).from(employees).where(where),
  ]);
  return { rows, total };
}

export async function listAllEmployees() {
  return getDb().select().from(employees).orderBy(...byName);
}

export async function getEmployee(id: string) {
  if (!isEmployeeId(id)) return null;
  const [row] = await getDb().select().from(employees).where(eq(employees.id, id)).limit(1);
  return row ?? null;
}

/** The employee that already has this phone number or employee code, if any */
export async function findEmployeeWith(field: "phone" | "empCode", value: string) {
  const column = field === "phone" ? employees.phone : employees.empCode;
  const [row] = await getDb()
    .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
    .from(employees)
    .where(eq(column, value))
    .limit(1);
  return row ?? null;
}
