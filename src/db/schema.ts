import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const templateStatus = pgEnum("template_status", [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "DISABLED",
]);

export const sendStatus = pgEnum("send_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empCode: text("emp_code").unique(),
    name: text("name").notNull(),
    // E.164, e.g. +919876543210
    phone: text("phone").notNull().unique(),
    birthDay: integer("birth_day").notNull(),
    birthMonth: integer("birth_month").notNull(),
    birthYear: integer("birth_year"),
    whatsappConsent: boolean("whatsapp_consent").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("employees_birth_month_day_idx").on(t.birthMonth, t.birthDay),
    check("employees_birth_day_range", sql`${t.birthDay} between 1 and 31`),
    check("employees_birth_month_range", sql`${t.birthMonth} between 1 and 12`),
    check("employees_phone_e164", sql`${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Meta format: lowercase letters, digits and underscores
    name: text("name").notNull(),
    language: text("language").notNull().default("en"),
    // {{1}} = employee name
    bodyText: text("body_text").notNull(),
    exampleValue: text("example_value"),
    category: text("category").notNull().default("MARKETING"),
    metaTemplateId: text("meta_template_id").unique(),
    status: templateStatus("status").notNull().default("DRAFT"),
    rejectionReason: text("rejection_reason"),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Meta identifies a template by name + language within a WABA
    unique("templates_name_language_uniq").on(t.name, t.language),
    // At most one active template
    uniqueIndex("templates_single_active_uniq")
      .on(t.isActive)
      .where(sql`is_active = true`),
    check("templates_name_format", sql`${t.name} ~ '^[a-z0-9_]+$'`),
  ],
);

export const sendLogs = pgTable(
  "send_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    sendYear: integer("send_year").notNull(),
    // Nullable so a template can be deleted without losing its send history
    templateId: uuid("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    status: sendStatus("status").notNull().default("queued"),
    waMessageId: text("wa_message_id").unique(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // One birthday wish per employee per year: the core double-send guard
    unique("send_logs_employee_year_uniq").on(t.employeeId, t.sendYear),
    index("send_logs_status_idx").on(t.status),
    index("send_logs_created_at_idx").on(t.createdAt),
  ],
);

export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // The Asia/Kolkata calendar date the run was for
    runDate: date("run_date", { mode: "string" }).notNull(),
    birthdaysFound: integer("birthdays_found").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    note: text("note"),
  },
  (t) => [index("cron_runs_started_at_idx").on(t.startedAt)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
    success: boolean("success").notNull(),
  },
  (t) => [index("login_attempts_ip_attempted_at_idx").on(t.ip, t.attemptedAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type SendLog = typeof sendLogs.$inferSelect;
export type CronRun = typeof cronRuns.$inferSelect;
