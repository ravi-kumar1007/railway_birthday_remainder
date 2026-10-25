import type { Metadata } from "next";
import { count } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, type BadgeTone } from "@/components/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { getDb, schema } from "@/db";
import { rethrowNextErrors } from "@/db/errors";
import { getSession } from "@/lib/auth/session";
import { MAX_ATTEMPTS } from "@/lib/birthday-run";
import { listTodaysBirthdays } from "@/lib/birthday-store";
import { appTimeZone, todayInTimeZone, toIsoDate } from "@/lib/dates";
import { describeError } from "@/lib/log";
import { formatPhone } from "@/lib/phone";
import { RunNowButton } from "./run-now-button";
import { TestMessageForm } from "./test-message-form";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's birthdays and the daily WhatsApp job. Stats and run history arrive in Phase 6."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TodaysBirthdays />
        </Suspense>
        <TestMessageForm />
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <SetupStatus />
        </Suspense>
      </div>
    </>
  );
}

const SEND_STATUS: Record<NonNullable<SendStatus>, { label: string; tone: BadgeTone }> = {
  queued: { label: "Sending", tone: "amber" },
  sent: { label: "Sent", tone: "emerald" },
  delivered: { label: "Delivered", tone: "emerald" },
  read: { label: "Read", tone: "emerald" },
  failed: { label: "Failed", tone: "red" },
};

type SendStatus = Awaited<ReturnType<typeof listTodaysBirthdays>>[number]["status"];

async function TodaysBirthdays() {
  // Today's date must be read per request
  await connection();
  const today = todayInTimeZone();
  const dateLabel = new Date(Date.UTC(today.year, today.month - 1, today.day)).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  let rows: Awaited<ReturnType<typeof listTodaysBirthdays>>;
  try {
    rows = await listTodaysBirthdays(today);
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading today's birthdays failed:", describeError(error));
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700 shadow-xs">
        Could not load today&apos;s birthdays. Check the database connection.
      </section>
    );
  }

  // Consenting employees not yet wished, or whose failed wish still has attempts left
  const waiting = rows.filter(
    (row) => row.whatsappConsent && (row.status === null || (row.status === "failed" && (row.attempts ?? 0) < MAX_ATTEMPTS)),
  ).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Today&apos;s birthdays</h2>
          <p className="mt-0.5 text-xs text-slate-500">{dateLabel} · wishes go out at 12:00 IST</p>
        </div>
        <RunNowButton waiting={waiting} />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No birthdays today.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const unknown = row.status === "queued" && row.errorMessage?.startsWith("Outcome unknown");
            const badge = !row.whatsappConsent
              ? { label: "No consent", tone: "slate" as const }
              : row.status === null
                ? { label: "Waiting", tone: "slate" as const }
                : unknown
                  ? { label: "Unknown", tone: "amber" as const }
                  : row.status === "failed"
                    ? { label: `Failed (${row.attempts}/${MAX_ATTEMPTS})`, tone: "red" as const }
                    : SEND_STATUS[row.status];
            return (
              <li key={row.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">🎂 {row.name}</p>
                  <p className="text-xs text-slate-500">{formatPhone(row.phone)}</p>
                  {row.errorMessage && row.status !== "sent" && (
                    <p className="mt-1 text-xs text-red-700">{row.errorMessage}</p>
                  )}
                </div>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

async function SetupStatus() {
  const session = await getSession();
  const timeZone = appTimeZone();
  const today = toIsoDate(todayInTimeZone(timeZone));

  let database: { ok: true; employees: number } | { ok: false; message: string };
  try {
    const [row] = await getDb().select({ value: count() }).from(schema.employees);
    database = { ok: true, employees: row.value };
  } catch (error) {
    rethrowNextErrors(error);
    // Drizzle's own message is just the SQL; the driver's message says what went wrong
    const message = describeError(error);
    database = {
      ok: false,
      message: /does not exist/.test(message)
        ? "Connected, but tables are missing. Run npm run db:migrate."
        : "Could not query the database. Check DATABASE_URL.",
    };
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Setup status</h2>
      <dl className="divide-y divide-slate-100 text-sm">
        <StatusRow label="Signed in as" value={session?.email ?? "—"} ok />
        <StatusRow
          label="Database"
          value={database.ok ? `Connected · ${database.employees} employees` : database.message}
          ok={database.ok}
        />
        <StatusRow label={`Today (${timeZone})`} value={today} ok />
      </dl>
    </section>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex items-center gap-2 font-medium">
        <span
          className={`size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
          aria-hidden
        />
        {value}
      </dd>
    </div>
  );
}
