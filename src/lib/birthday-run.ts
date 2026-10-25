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

/** A claimed send slot, or why there is none: already sent, being sent now, or out of attempts */
export type Claim = { logId: string; attempt: number } | { skip: "sent" | "in_progress" | "gave_up" };

export interface BirthdayStore {
  startRun(runDate: string): Promise<string>;
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
}: {
  store: BirthdayStore;
  send: SendFn;
  today?: CalendarDate;
  now?: () => number;
  /** Why sending is impossible right now (Meta not configured), if it is */
  unavailable?: string | null;
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
  const runId = await store.startRun(summary.runDate);

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
