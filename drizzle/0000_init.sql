CREATE TYPE "public"."send_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"run_date" date NOT NULL,
	"birthdays_found" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emp_code" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"birth_day" integer NOT NULL,
	"birth_month" integer NOT NULL,
	"birth_year" integer,
	"whatsapp_consent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_emp_code_unique" UNIQUE("emp_code"),
	CONSTRAINT "employees_phone_unique" UNIQUE("phone"),
	CONSTRAINT "employees_birth_day_range" CHECK ("employees"."birth_day" between 1 and 31),
	CONSTRAINT "employees_birth_month_range" CHECK ("employees"."birth_month" between 1 and 12),
	CONSTRAINT "employees_phone_e164" CHECK ("employees"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"send_year" integer NOT NULL,
	"template_id" uuid,
	"status" "send_status" DEFAULT 'queued' NOT NULL,
	"wa_message_id" text,
	"error_code" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "send_logs_wa_message_id_unique" UNIQUE("wa_message_id"),
	CONSTRAINT "send_logs_employee_year_uniq" UNIQUE("employee_id","send_year")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"body_text" text NOT NULL,
	"example_value" text,
	"category" text DEFAULT 'MARKETING' NOT NULL,
	"meta_template_id" text,
	"status" "template_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_meta_template_id_unique" UNIQUE("meta_template_id"),
	CONSTRAINT "templates_name_language_uniq" UNIQUE("name","language"),
	CONSTRAINT "templates_name_format" CHECK ("templates"."name" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
ALTER TABLE "send_logs" ADD CONSTRAINT "send_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_logs" ADD CONSTRAINT "send_logs_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cron_runs_started_at_idx" ON "cron_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "employees_birth_month_day_idx" ON "employees" USING btree ("birth_month","birth_day");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_attempted_at_idx" ON "login_attempts" USING btree ("ip","attempted_at");--> statement-breakpoint
CREATE INDEX "send_logs_status_idx" ON "send_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "send_logs_created_at_idx" ON "send_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_single_active_uniq" ON "templates" USING btree ("is_active") WHERE is_active = true;