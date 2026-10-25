import { describe, expect, it } from "vitest";
import {
  CONCURRENCY,
  isCronOverdue,
  MAX_ATTEMPTS,
  retryWish,
  runBirthdays,
  START_BUDGET_MS,
  type BirthdayStore,
  type Claim,
  type RunSummary,
  type SendFn,
} from "@/lib/birthday-run";
import type { NameFormat } from "@/lib/names";
import { UNKNOWN_OUTCOME } from "@/lib/birthday-run";

type Log = {
  id: string;
  employeeId: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
  waMessageId?: string;
  error?: string;
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

/**
 * In-memory stand-in for the database. Each method does its read and write without yielding in between,
 * like the single SQL statements the real store uses, so concurrent runs interleave realistically.
 */
class MemoryStore implements BirthdayStore {
  logs = new Map<string, Log>();
  runs: (RunSummary & { id: string; source: string; finished: boolean })[] = [];
  inactive = new Set<string>();
  noConsent = new Set<string>();
  queries: { month: number; day: number }[][] = [];
  template: { id: string; name: string; language: string; status: "APPROVED" | "PAUSED"; bodyText: string } | null = {
    id: "tpl",
    name: "birthday_wish",
    language: "en",
    status: "APPROVED",
    bodyText: "Happy birthday, {{1}}!",
  };
  nameFormat: NameFormat = "first";

  constructor(public employees: { id: string; name: string; phone: string }[]) {}

  async startRun(runDate: string, source: "cron" | "admin") {
    const id = `run${this.runs.length + 1}`;
    this.runs.push({ id, runDate, source, birthdaysFound: 0, sent: 0, failed: 0, skipped: 0, remaining: 0, note: null, finished: false });
    return id;
  }
  async finishRun(id: string, summary: RunSummary) {
    Object.assign(this.runs.find((run) => run.id === id)!, summary, { finished: true });
  }
  async findBirthdayEmployees(matches: { month: number; day: number }[]) {
    this.queries.push(matches);
    return this.employees;
  }
  async getActiveTemplate() {
    return this.template;
  }
  async getNameFormat() {
    return this.nameFormat;
  }
  async claim(employeeId: string, year: number): Promise<Claim> {
    await tick();
    const key = `${employeeId}:${year}`;
    const log = this.logs.get(key);
    if (!log) {
      this.logs.set(key, { id: key, employeeId, status: "queued", attempts: 1 });
      return { logId: key, attempt: 1 };
    }
    if (log.status === "failed" && log.attempts < MAX_ATTEMPTS) {
      Object.assign(log, { status: "queued", attempts: log.attempts + 1 });
      return { logId: key, attempt: log.attempts };
    }
    return { skip: log.status === "queued" ? "in_progress" : log.status === "failed" ? "gave_up" : "sent" };
  }
  async release(logId: string, attempt: number) {
    if (attempt === 1) this.logs.delete(logId);
    else Object.assign(this.logs.get(logId)!, { status: "failed", attempts: attempt - 1 });
  }
  async markSent(logId: string, waMessageId: string) {
    Object.assign(this.logs.get(logId)!, { status: "sent", waMessageId });
  }
  async markFailed(logId: string, code: string, message: string) {
    Object.assign(this.logs.get(logId)!, { status: "failed", error: `${code}: ${message}` });
  }
  async markUnknown(logId: string, message: string) {
    Object.assign(this.logs.get(logId)!, { error: `${UNKNOWN_OUTCOME} ${message}` });
  }
  async getLogForRetry(logId: string) {
    const log = this.logs.get(logId);
    const employee = log && this.employees.find((e) => e.id === log.employeeId);
    if (!log || !employee) return null;
    return {
      status: log.status,
      errorMessage: log.error ?? null,
      employee: { ...employee, isActive: !this.inactive.has(employee.id), whatsappConsent: !this.noConsent.has(employee.id) },
    };
  }
  async claimManualRetry(logId: string) {
    await tick();
    const log = this.logs.get(logId);
    const retryable = log && (log.status === "failed" || (log.status === "queued" && log.error?.startsWith(UNKNOWN_OUTCOME)));
    if (!log || !retryable) return null;
    Object.assign(log, { status: "queued", attempts: log.attempts + 1, error: undefined });
    return log.attempts;
  }
}

const people = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `e${i + 1}`, name: `Person${i + 1} Surname`, phone: `+9198765432${String(i).padStart(2, "0")}` }));

const TODAY = { year: 2026, month: 8, day: 15 };

function recordingSender(outcome: Awaited<ReturnType<SendFn>> = { ok: true, waMessageId: "wamid" }) {
  const calls: Parameters<SendFn>[0][] = [];
  const send: SendFn = async (message) => {
    calls.push(message);
    await tick();
    return outcome;
  };
  return { calls, send };
}

describe("runBirthdays", () => {
  it("sends each birthday wish once, with the active template and first name", async () => {
    const store = new MemoryStore(people(2));
    const { calls, send } = recordingSender();
    const summary = await runBirthdays({ store, send, today: TODAY });

    expect(calls).toEqual([
      { to: "+919876543200", templateName: "birthday_wish", language: "en", name: "Person1" },
      { to: "+919876543201", templateName: "birthday_wish", language: "en", name: "Person2" },
    ]);
    expect(summary).toMatchObject({ runDate: "2026-08-15", birthdaysFound: 2, sent: 2, failed: 0, skipped: 0, remaining: 0 });
    expect([...store.logs.values()].map((log) => log.status)).toEqual(["sent", "sent"]);
  });

  it("uses the full name when the setting says so", async () => {
    const store = new MemoryStore(people(1));
    store.nameFormat = "full";
    const { calls, send } = recordingSender();
    await runBirthdays({ store, send, today: TODAY });
    expect(calls[0].name).toBe("Person1 Surname");
  });

  it("never double-sends when two runs start at the same moment", async () => {
    const store = new MemoryStore(people(12));
    const { calls, send } = recordingSender();
    const [first, second] = await Promise.all([
      runBirthdays({ store, send, today: TODAY }),
      runBirthdays({ store, send, today: TODAY }),
    ]);

    expect(calls.map((call) => call.to).sort()).toEqual(people(12).map((p) => p.phone).sort());
    expect(first.sent + second.sent).toBe(12);
    expect(first.skipped + second.skipped).toBe(12);
  });

  it("skips people already wished on a later run the same day", async () => {
    const store = new MemoryStore(people(3));
    const { calls, send } = recordingSender();
    await runBirthdays({ store, send, today: TODAY });
    const again = await runBirthdays({ store, send, today: TODAY });

    expect(calls).toHaveLength(3);
    expect(again).toMatchObject({ sent: 0, skipped: 3 });
  });

  it(`retries a failed send on later runs, up to ${MAX_ATTEMPTS} attempts in all`, async () => {
    const store = new MemoryStore(people(1));
    const { calls, send } = recordingSender({ ok: false, definite: true, code: "131026", message: "Message undeliverable" });
    for (let run = 0; run < MAX_ATTEMPTS + 2; run++) await runBirthdays({ store, send, today: TODAY });

    expect(calls).toHaveLength(MAX_ATTEMPTS);
    expect(store.logs.get("e1:2026")).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, error: "131026: Message undeliverable" });
  });

  it("never retries a send whose outcome is unknown", async () => {
    const store = new MemoryStore(people(1));
    const { calls, send } = recordingSender({ ok: false, definite: false, message: "Meta didn't answer in time." });
    const first = await runBirthdays({ store, send, today: TODAY });
    const second = await runBirthdays({ store, send, today: TODAY });

    expect(calls).toHaveLength(1);
    expect(first).toMatchObject({ failed: 1, note: expect.stringMatching(/1 .*unknown/i) });
    expect(second).toMatchObject({ skipped: 1 });
    expect(store.logs.get("e1:2026")).toMatchObject({ status: "queued", error: `${UNKNOWN_OUTCOME} Meta didn't answer in time.` });
  });

  it("sends nothing without an active approved template, and says why", async () => {
    for (const template of [null, { id: "t", name: "wish", language: "en", status: "PAUSED" as const, bodyText: "Hi {{1}}!" }]) {
      const store = new MemoryStore(people(2));
      store.template = template;
      const { calls, send } = recordingSender();
      const summary = await runBirthdays({ store, send, today: TODAY });

      expect(calls).toHaveLength(0);
      expect(store.logs.size).toBe(0);
      expect(summary).toMatchObject({ birthdaysFound: 2, sent: 0, note: expect.stringMatching(/template/i) });
    }
  });

  it("sends nothing when Meta isn't configured", async () => {
    const store = new MemoryStore(people(1));
    const { calls, send } = recordingSender();
    const summary = await runBirthdays({ store, send, today: TODAY, unavailable: "META_ACCESS_TOKEN: is not set" });
    expect(calls).toHaveLength(0);
    expect(summary.note).toMatch(/META_ACCESS_TOKEN/);
  });

  it("looks up 29 Feb birthdays on 28 Feb in non-leap years", async () => {
    const store = new MemoryStore([]);
    await runBirthdays({ store, send: recordingSender().send, today: { year: 2027, month: 2, day: 28 } });
    expect(store.queries).toEqual([[{ month: 2, day: 28 }, { month: 2, day: 29 }]]);
  });

  it(`runs at most ${CONCURRENCY} sends at once`, async () => {
    const store = new MemoryStore(people(17));
    let inFlight = 0;
    let peak = 0;
    const send: SendFn = async () => {
      peak = Math.max(peak, ++inFlight);
      await tick();
      inFlight--;
      return { ok: true, waMessageId: "wamid" };
    };
    const summary = await runBirthdays({ store, send, today: TODAY });
    expect(summary.sent).toBe(17);
    expect(peak).toBe(CONCURRENCY);
  });

  it(`stops starting sends after ${START_BUDGET_MS / 1000} seconds and reports what's left`, async () => {
    const store = new MemoryStore(people(40));
    let clock = 0;
    const startedAt: number[] = [];
    const send: SendFn = async () => {
      startedAt.push(clock);
      clock += 1000;
      await tick();
      return { ok: true, waMessageId: "wamid" };
    };
    const summary = await runBirthdays({ store, send, today: TODAY, now: () => clock });

    expect(Math.max(...startedAt)).toBeLessThan(START_BUDGET_MS);
    expect(summary.remaining).toBeGreaterThan(0);
    expect(summary.sent + summary.remaining).toBe(40);
    expect(summary.note).toMatch(new RegExp(`${summary.remaining} left`));

    // A later call picks up where this one stopped, without repeats
    clock = 0;
    const next = await runBirthdays({ store, send, today: TODAY, now: () => 0 });
    expect(next.sent).toBe(summary.remaining);
    expect(startedAt).toHaveLength(40);
  });

  it("records the run with its counts, even when nobody has a birthday", async () => {
    const store = new MemoryStore([]);
    await runBirthdays({ store, send: recordingSender().send, today: TODAY });
    expect(store.runs).toEqual([
      expect.objectContaining({ runDate: "2026-08-15", source: "cron", birthdaysFound: 0, finished: true, note: "No birthdays today." }),
    ]);
    await runBirthdays({ store, send: recordingSender().send, today: TODAY, source: "admin" });
    expect(store.runs[1].source).toBe("admin");
  });
});

describe("isCronOverdue", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  it("warns when no scheduled run has happened in 26 hours", () => {
    expect(isCronOverdue(null, now)).toBe(true);
    expect(isCronOverdue(new Date("2026-08-14T09:59:00Z"), now)).toBe(true);
    expect(isCronOverdue(new Date("2026-08-14T10:01:00Z"), now)).toBe(false);
  });
});

describe("retryWish", () => {
  async function failedOnce() {
    const store = new MemoryStore(people(1));
    await runBirthdays({ store, send: recordingSender({ ok: false, definite: true, code: "131026", message: "Undeliverable" }).send, today: TODAY });
    return store;
  }

  it("resends a failed wish and records the result", async () => {
    const store = await failedOnce();
    const { calls, send } = recordingSender();
    expect(await retryWish({ store, send, logId: "e1:2026" })).toEqual({ ok: true });
    expect(calls).toEqual([{ to: "+919876543200", templateName: "birthday_wish", language: "en", name: "Person1" }]);
    expect(store.logs.get("e1:2026")).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("sends once when Retry is clicked twice at the same moment", async () => {
    const store = await failedOnce();
    const { calls, send } = recordingSender();
    const results = await Promise.all([retryWish({ store, send, logId: "e1:2026" }), retryWish({ store, send, logId: "e1:2026" })]);
    expect(calls).toHaveLength(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("can retry a send whose outcome was unknown, when an admin chooses to", async () => {
    const store = new MemoryStore(people(1));
    await runBirthdays({ store, send: recordingSender({ ok: false, definite: false, message: "No answer" }).send, today: TODAY });
    const { calls, send } = recordingSender();
    expect(await retryWish({ store, send, logId: "e1:2026" })).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  it("refuses wishes already sent, inactive employees and withdrawn consent", async () => {
    const sent = new MemoryStore(people(1));
    await runBirthdays({ store: sent, send: recordingSender().send, today: TODAY });
    expect(await retryWish({ store: sent, send: recordingSender().send, logId: "e1:2026" })).toMatchObject({ ok: false });

    for (const flag of ["inactive", "noConsent"] as const) {
      const store = await failedOnce();
      store[flag].add("e1");
      const { calls, send } = recordingSender();
      expect(await retryWish({ store, send, logId: "e1:2026" })).toMatchObject({ ok: false });
      expect(calls).toHaveLength(0);
    }
  });
});
