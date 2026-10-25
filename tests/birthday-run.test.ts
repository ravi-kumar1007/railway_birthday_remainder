import { describe, expect, it } from "vitest";
import {
  CONCURRENCY,
  MAX_ATTEMPTS,
  runBirthdays,
  START_BUDGET_MS,
  type BirthdayStore,
  type Claim,
  type RunSummary,
  type SendFn,
} from "@/lib/birthday-run";
import type { NameFormat } from "@/lib/names";

type Log = { id: string; status: "queued" | "sent" | "failed"; attempts: number; waMessageId?: string; error?: string };

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

/**
 * In-memory stand-in for the database. Each method does its read and write without yielding in between,
 * like the single SQL statements the real store uses, so concurrent runs interleave realistically.
 */
class MemoryStore implements BirthdayStore {
  logs = new Map<string, Log>();
  runs: (RunSummary & { id: string; finished: boolean })[] = [];
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

  async startRun(runDate: string) {
    const id = `run${this.runs.length + 1}`;
    this.runs.push({ id, runDate, birthdaysFound: 0, sent: 0, failed: 0, skipped: 0, remaining: 0, note: null, finished: false });
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
      this.logs.set(key, { id: key, status: "queued", attempts: 1 });
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
    Object.assign(this.logs.get(logId)!, { error: message });
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
    expect(store.logs.get("e1:2026")).toMatchObject({ status: "queued", error: "Meta didn't answer in time." });
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
      expect.objectContaining({ runDate: "2026-08-15", birthdaysFound: 0, finished: true, note: "No birthdays today." }),
    ]);
  });
});
