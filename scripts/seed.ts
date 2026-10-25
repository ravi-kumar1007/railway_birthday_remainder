/**
 * Adds 5 sample employees, one with a birthday today (IST), so the dashboard and the daily job have
 * something to show. Running it again updates the same 5 rows (employee codes SEED-1 to SEED-5).
 *
 *   npm run seed                          sample numbers in the US 555-01xx range, which is reserved
 *                                         for fiction, so no real person can receive a message
 *   npm run seed -- --phone 9876543210    today's birthday gets your own WhatsApp number, so
 *                                         "Run now" sends you a real birthday wish
 *   add --yes to skip the confirmation
 */
import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { createInterface } from "node:readline/promises";
import { uniqueViolation } from "../src/db/errors";
import * as schema from "../src/db/schema";
import { addDays, todayInTimeZone } from "../src/lib/dates";
import { normalizePhone } from "../src/lib/phone";

// Load .env / .env.local the same way Next.js does
loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function confirm(question: string): Promise<boolean> {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) return false;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`${question} [y/N] `);
  readline.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }

  let ownPhone: string | undefined;
  const phoneArgument = argument("--phone");
  if (phoneArgument !== undefined) {
    const result = normalizePhone(phoneArgument);
    if (!result.ok) {
      console.error(`--phone: ${result.error}`);
      process.exit(1);
    }
    ownPhone = result.phone;
  }

  const today = todayInTimeZone();
  const on = (days: number, year: number | null) => {
    const date = addDays(today, days);
    return { birthDay: date.day, birthMonth: date.month, birthYear: year };
  };
  const employees: (typeof schema.employees.$inferInsert)[] = [
    { empCode: "SEED-1", name: "Priya Sharma", phone: ownPhone ?? "+12025550101", ...on(0, 1992), whatsappConsent: true },
    { empCode: "SEED-2", name: "Rahul Verma", phone: "+12025550102", ...on(1, 1988), whatsappConsent: true },
    { empCode: "SEED-3", name: "Ananya Iyer", phone: "+12025550103", ...on(10, null), whatsappConsent: false },
    { empCode: "SEED-4", name: "Dr. Kavya Nair", phone: "+12025550104", birthDay: 29, birthMonth: 2, birthYear: 1996, whatsappConsent: true },
    { empCode: "SEED-5", name: "Arjun Mehta", phone: "+12025550105", ...on(45, 1990), whatsappConsent: true, isActive: false },
  ];

  const host = new URL(databaseUrl).hostname;
  console.log(`Sample employees for ${host}:`);
  for (const employee of employees) {
    const birthday = `${employee.birthDay}/${employee.birthMonth}${employee.birthYear ? `/${employee.birthYear}` : ""}`;
    console.log(`  ${employee.empCode}  ${employee.name.padEnd(15)} ${birthday.padEnd(11)} consent: ${employee.whatsappConsent ? "yes" : "no"}${employee.isActive === false ? ", inactive" : ""}`);
  }
  if (ownPhone) console.log(`\nPriya's birthday is today and uses YOUR number: "Run now" will send you a real WhatsApp message.`);
  if (!(await confirm("\nSave them?"))) {
    console.log("Nothing saved.");
    return;
  }

  const db = drizzle({ client: neon(databaseUrl), schema });
  const excluded = (column: string) => sql.raw(`excluded.${column}`);
  try {
    await db
      .insert(schema.employees)
      .values(employees)
      .onConflictDoUpdate({
        target: schema.employees.empCode,
        set: {
          name: excluded("name"),
          phone: excluded("phone"),
          birthDay: excluded("birth_day"),
          birthMonth: excluded("birth_month"),
          birthYear: excluded("birth_year"),
          whatsappConsent: excluded("whatsapp_consent"),
          isActive: excluded("is_active"),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    if (uniqueViolation(error) === "employees_phone_unique") {
      console.error("That phone number already belongs to another employee. Use a different one, or remove that employee first.");
    } else {
      const cause = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
      console.error(`Could not save: ${cause.startsWith("Failed query") ? "database error" : cause}`);
    }
    process.exit(1);
  }
  console.log("Saved 5 sample employees. Open /admin to see them.");
}

main();
