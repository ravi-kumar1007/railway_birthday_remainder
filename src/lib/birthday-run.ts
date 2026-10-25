import type { Template } from "@/db/schema";
import { birthdayMonthDaysOn } from "./birthday";
import { todayInTimeZone, toIsoDate, type CalendarDate } from "./dates";
import { nameForMessage, type NameFormat } from "./names";
import { isUsableForBirthdays } from "./template-sync";

// The daily birthday job, independent of the database and Meta so its guarantees can be tested:
// each employee gets at most one wish per year, however many times or however concurrently it runs.

/** Send attempts per employee per year, counting the first */
export const MAX_ATTEMPTS = 3;
export const CONCURRENCY = 5;
/** No new sends start after this, so a run ends inside a serverless time limit */
export const START_BUDGET_MS = 8000;
const SEND_TIMEOUT_MS = 5000;
const HARD_LIMIT_MS = 9500;

/** How send_logs.error_message starts on a send that got no answer from Meta */
export const UNKNOWN_OUTCOME = "Outcome unknown, not retried automatically:";

/** The dashboard warns when cron-job.org hasn't called for this long */
export const CRON_OVERDUE_HOURS = 26;

export function isCronOverdue(lastCronRunAt: Date | null, now: Date = new Date()): boolean {
  return !lastCronRunAt || now.getTime() - lastCronRunAt.getTime() > CRON_OVERDUE_HOURS * 3_600_000;
}

export type RunSource = "cron" | "admin";

/** A claimed send slot, or why there is none: already sent, being sent now, or out of attempts */
export type Claim = { logId: string; attempt: number } | { skip: "sent" | "in_progress" | "gave_up" };

export interface BirthdayStore {
  startRun(runDate: string, source: RunSource): Promise<string>;
  finishRun(runId: string, summary: RunSummary): Promise<void>;
  findBirthdayEmployees(matches: { month: number; day: number }[]): Promise<{ id: string; name: string; phone: string }[]>;
  getActiveTemplate(): Promise<Pick<Template, "id" | "name" | "language" | "status" | "bodyText"> | null>;
  getNameFormat(): Promise<NameFormat>;
  /**
   * Atomically records a queued send before anything goes out: a new row for this employee and year,
   * or a failed row with attempts left. Two runs can never both claim the same slot.
   */
  claim(employeeId: string, year: number, templateId: string): Promise<Claim>;
  /** Undoes a claim that was never sent, so the next run can take it */
  release(logId: string, attempt: number): Promise<void>;
  markSent(logId: string, waMessageId: string): Promise<void>;
  markFailed(logId: string, code: string, message: string): Promise<void>;
  /** Leaves the row queued, so it is never retried automatically */
  markUnknown(logId: string, message: string): Promise<void>;
  getLogForRetry(logId: string): Promise<{
    status: "queued" | "sent" | "delivered" | "read" | "failed";
    errorMessage: string | null;
    employee: { id: string; name: string; phone: string; isActive: boolean; whatsappConsent: boolean };
  } | null>;
  /**
   * Atomically takes a failed send, or one with an unknown outcome, for a manual retry and returns
   * its new attempt number; null if it isn't retryable or someone else just took it.
   */
  claimManualRetry(logId: string): Promise<number | null>;
}

export type SendFn = (
  message: { to: string; templateName: string; language: string; name: string },
  timeoutMs: number,
) => Promise<
  | { ok: true; waMessageId: string }
  | { ok: false; definite: true; code: string; message: string }
  | { ok: false; definite: false; message: string }
>;

export type RunSummary = {
  runDate: string;
  birthdaysFound: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Not started before the time budget ran out; the next call picks them up */
  remaining: number;
  note: string | null;
};

export async function runBirthdays({
  store,
  send,
  today = todayInTimeZone(),
  now = Date.now,
  unavailable = null,
  source = "cron",
}: {
  store: BirthdayStore;
  send: SendFn;
  today?: CalendarDate;
  now?: () => number;
  /** Why sending is impossible right now (Meta not configured), if it is */
  unavailable?: string | null;
  source?: RunSource;
}): Promise<RunSummary> {
  const started = now();
  const summary: RunSummary = {
    runDate: toIsoDate(today),
    birthdaysFound: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    note: null,
  };
  const runId = await store.startRun(summary.runDate, source);

  try {
    const employees = await store.findBirthdayEmployees(birthdayMonthDaysOn(today));
    summary.birthdaysFound = employees.length;
    if (employees.length === 0) {
      summary.note = "No birthdays today.";
      return summary;
    }
    if (unavailable) {
      summary.note = `Nothing sent: ${unavailable}`;
      return summary;
    }
    const template = await store.getActiveTemplate();
    if (!template || !isUsableForBirthdays(template)) {
      summary.note = template
        ? `Nothing sent: the active template ${template.name} is ${template.status.toLowerCase()}, not approved.`
        : "Nothing sent: there is no active approved template.";
      return summary;
    }
    const nameFormat = await store.getNameFormat();

    const queue = [...employees];
    let unknown = 0;
    const worker = async () => {
      while (queue.length > 0 && now() - started < START_BUDGET_MS) {
        const employee = queue.shift()!;
        const claim = await store.claim(employee.id, today.year, template.id);
        if ("skip" in claim) {
          summary.skipped++;
          continue;
        }
        if (now() - started >= START_BUDGET_MS) {
          // Time ran out while claiming: give the slot back unsent for the next run
          await store.release(claim.logId, claim.attempt);
          queue.unshift(employee);
          break;
        }
        const outcome = await send(
          { to: employee.phone, templateName: template.name, language: template.language, name: nameForMessage(employee.name, nameFormat) },
          Math.max(1000, Math.min(SEND_TIMEOUT_MS, HARD_LIMIT_MS - (now() - started))),
        );
        if (outcome.ok) {
          await store.markSent(claim.logId, outcome.waMessageId);
          summary.sent++;
        } else if (outcome.definite) {
          await store.markFailed(claim.logId, outcome.code, outcome.message);
          summary.failed++;
        } else {
          await store.markUnknown(claim.logId, outcome.message);
          summary.failed++;
          unknown++;
        }
      }
    };
    // allSettled: one worker's database error must not end the run while the others are mid-send
    const results = await Promise.allSettled(Array.from({ length: CONCURRENCY }, worker));
    const crashed = results.filter((result) => result.status === "rejected").length;

    summary.remaining = queue.length;
    summary.note =
      [
        summary.remaining > 0 && `Stopped after ${START_BUDGET_MS / 1000} s; ${summary.remaining} left for the next run.`,
        unknown > 0 && `${unknown} got no answer from Meta, so the outcome is unknown; they won't be retried automatically.`,
        crashed > 0 && `${crashed} of ${CONCURRENCY} workers hit a database error.`,
      ]
        .filter(Boolean)
        .join(" ") || null;
    return summary;
  } finally {
    await store.finishRun(runId, summary);
  }
}

/**
 * An admin's Retry on one send from the logs page: a failed one, or one whose outcome was unknown
 * (the admin has checked it didn't arrive). The claim is atomic, so a double click sends once.
 */
export async function retryWish({
  store,
  send,
  logId,
  unavailable = null,
}: {
  store: BirthdayStore;
  send: SendFn;
  logId: string;
  unavailable?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fail = (error: string) => ({ ok: false as const, error });
  if (unavailable) return fail(`Meta isn't connected: ${unavailable}`);

  const log = await store.getLogForRetry(logId);
  if (!log) return fail("This send no longer exists.");
  const unknown = log.status === "queued" && Boolean(log.errorMessage?.startsWith(UNKNOWN_OUTCOME));
  if (log.status !== "failed" && !unknown) return fail("Only failed sends, or ones with an unknown outcome, can be retried.");
  if (!log.employee.isActive) return fail(`${log.employee.name} is inactive.`);
  if (!log.employee.whatsappConsent) return fail(`${log.employee.name} hasn't agreed to WhatsApp messages.`);

  const template = await store.getActiveTemplate();
  if (!template || !isUsableForBirthdays(template)) return fail("There's no active approved template to send.");
  const nameFormat = await store.getNameFormat();

  const attempt = await store.claimManualRetry(logId);
  if (attempt === null) return fail("This send is already being retried.");

  const outcome = await send(
    {
      to: log.employee.phone,
      templateName: template.name,
      language: template.language,
      name: nameForMessage(log.employee.name, nameFormat),
    },
    SEND_TIMEOUT_MS,
  );
  if (outcome.ok) {
    await store.markSent(logId, outcome.waMessageId);
    return { ok: true };
  }
  if (outcome.definite) {
    await store.markFailed(logId, outcome.code, outcome.message);
    return fail(`Meta didn't send it: ${outcome.message}`);
  }
  await store.markUnknown(logId, outcome.message);
  return fail(`No answer from Meta (${outcome.message}). Check the phone before retrying again.`);
}
