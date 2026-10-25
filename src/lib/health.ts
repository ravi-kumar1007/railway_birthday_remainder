import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { rethrowNextErrors } from "@/db/errors";
import { CRON_OVERDUE_HOURS, isCronOverdue } from "./birthday-run";
import { birthdayStore } from "./birthday-store";
import { cronEnv, EnvError, metaConfigProblem, metaEnv, webhookEnv } from "./env";
import { describeError } from "./log";
import { graphRequest, MetaApiError } from "./meta/graph";
import { formatPhone } from "./phone";
import { isUsableForBirthdays } from "./template-sync";
import { languageLabel } from "./templates";

export type HealthCheck = { name: string; state: "ok" | "warn" | "error"; detail: string };

function configProblem(read: () => unknown): string | null {
  try {
    read();
    return null;
  } catch (error) {
    if (error instanceof EnvError) return error.message;
    throw error;
  }
}

async function checkDatabase(): Promise<HealthCheck> {
  const name = "Database";
  try {
    const [row] = await getDb().select({ value: count() }).from(schema.employees);
    return { name, state: "ok", detail: `Connected · ${row.value} employees` };
  } catch (error) {
    rethrowNextErrors(error);
    // Drizzle's own message is just the SQL; the driver's message says what went wrong
    const message = describeError(error);
    return {
      name,
      state: "error",
      detail: /does not exist/.test(message)
        ? "Connected, but the tables are missing. Run npm run db:migrate."
        : `Can't reach the database. Check DATABASE_URL. (${message})`,
    };
  }
}

async function checkMeta(): Promise<HealthCheck> {
  const name = "Meta WhatsApp";
  const problem = metaConfigProblem();
  if (problem) return { name, state: "error", detail: problem };
  try {
    // One call proves the token, its permissions and the phone number ID together
    const phone = await graphRequest<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      metaEnv().META_PHONE_NUMBER_ID,
      { query: { fields: "display_phone_number,verified_name,quality_rating" }, timeoutMs: 5000 },
    );
    const number = phone.display_phone_number ? formatPhone(`+${phone.display_phone_number.replace(/\D/g, "")}`) : "the number";
    return {
      name,
      state: "ok",
      detail: `Token works. Sending from ${number}${phone.verified_name ? ` (${phone.verified_name})` : ""}${
        phone.quality_rating ? ` · quality ${phone.quality_rating.toLowerCase()}` : ""
      }.`,
    };
  } catch (error) {
    if (error instanceof MetaApiError) return { name, state: "error", detail: error.message };
    throw error;
  }
}

async function checkTemplate(): Promise<HealthCheck> {
  const name = "Active template";
  try {
    const template = await birthdayStore.getActiveTemplate();
    if (!template) return { name, state: "error", detail: "None. Choose an approved template on the Templates page." };
    if (!isUsableForBirthdays(template)) {
      return { name, state: "error", detail: `${template.name} is ${template.status.toLowerCase()}, so nothing can be sent.` };
    }
    return { name, state: "ok", detail: `${template.name} (${languageLabel(template.language)})` };
  } catch (error) {
    rethrowNextErrors(error);
    return { name, state: "error", detail: "Couldn't check: the database isn't reachable." };
  }
}

async function checkSchedule(): Promise<HealthCheck> {
  const name = "Daily schedule";
  const problem = configProblem(cronEnv);
  if (problem) return { name, state: "error", detail: problem };
  try {
    const [last] = await getDb()
      .select({ startedAt: schema.cronRuns.startedAt })
      .from(schema.cronRuns)
      .where(eq(schema.cronRuns.source, "cron"))
      .orderBy(desc(schema.cronRuns.startedAt))
      .limit(1);
    if (isCronOverdue(last?.startedAt ?? null)) {
      return {
        name,
        state: "warn",
        detail: last
          ? `CRON_SECRET is set, but no scheduled run in the last ${CRON_OVERDUE_HOURS} hours. Check cron-job.org.`
          : "CRON_SECRET is set, but cron-job.org hasn't called yet.",
      };
    }
    return { name, state: "ok", detail: "CRON_SECRET is set and cron-job.org called within the last day." };
  } catch (error) {
    rethrowNextErrors(error);
    return { name, state: "warn", detail: "CRON_SECRET is set; the last run couldn't be checked." };
  }
}

function checkWebhook(): HealthCheck {
  const problem = configProblem(webhookEnv);
  return problem
    ? { name: "Webhook", state: "warn", detail: `Delivered and read ticks won't update until this is fixed: ${problem}` }
    : { name: "Webhook", state: "ok", detail: "META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN are set." };
}

/** Every check at once; none of them throws */
export async function runHealthChecks(): Promise<HealthCheck[]> {
  return Promise.all([checkDatabase(), checkMeta(), checkTemplate(), checkSchedule(), Promise.resolve(checkWebhook())]);
}
