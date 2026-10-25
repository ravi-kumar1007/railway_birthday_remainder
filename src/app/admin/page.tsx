import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/badge";
import { PageHeader } from "@/components/page-header";
import { SendStatusBadge } from "@/components/send-status-badge";
import { Skeleton } from "@/components/skeleton";
import { rethrowNextErrors } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { formatBirthday } from "@/lib/birthday";
import { CRON_OVERDUE_HOURS, isCronOverdue, MAX_ATTEMPTS } from "@/lib/birthday-run";
import { listTodaysBirthdays } from "@/lib/birthday-store";
import { getDashboardStats, UPCOMING_DAYS } from "@/lib/dashboard";
import { appTimeZone, todayInTimeZone } from "@/lib/dates";
import { describeError } from "@/lib/log";
import { formatPhone } from "@/lib/phone";
import { RunNowButton } from "./run-now-button";
import { TestMessageForm } from "./test-message-form";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Today's birthdays, what's coming up, and how the daily WhatsApp job is doing." />
      <Suspense fallback={<Skeleton className="h-28" />}>
        <Overview />
      </Suspense>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TodaysBirthdays />
        </Suspense>
        <TestMessageForm />
      </div>
    </>
  );
}

async function Overview() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  // Today's date must be read per request
  await connection();
  const timeZone = appTimeZone();
  const today = todayInTimeZone(timeZone);

  let stats: Awaited<ReturnType<typeof getDashboardStats>>;
  try {
    stats = await getDashboardStats(today, timeZone);
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading dashboard stats failed:", describeError(error));
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700 shadow-xs">
        Could not load the dashboard. Check the database connection, or open{" "}
        <Link href="/admin/settings" className="font-medium underline">
          Settings
        </Link>{" "}
        for a health check.
      </p>
    );
  }

  const when = (date: Date) =>
    new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
  const { lastRun, lastCronRunAt } = stats;

  return (
    <div className="space-y-6">
      {isCronOverdue(lastCronRunAt) && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong className="font-semibold">
            {lastCronRunAt
              ? `No scheduled run since ${when(lastCronRunAt)}, more than ${CRON_OVERDUE_HOURS} hours ago.`
              : "The daily job has never run on schedule."}
          </strong>{" "}
          Check that cron-job.org is calling /api/cron/send-birthdays every day at 12:00 IST. Runs started with
          &ldquo;Run now&rdquo; don&apos;t count.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active employees" value={stats.activeEmployees} href="/admin/employees" />
        <Stat label="Birthdays today" value={stats.birthdaysToday} />
        <Stat label={`Next ${UPCOMING_DAYS} days`} value={stats.upcoming.length} />
        <Stat
          label="Failed this month"
          value={stats.failedThisMonth}
          href="/admin/logs?status=failed"
          alert={stats.failedThisMonth > 0}
        />
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Last run">
          {lastRun ? (
            <div className="px-5 py-4 text-sm">
              <p className="font-medium">
                {when(lastRun.startedAt)} · {lastRun.source === "admin" ? "Run now" : "scheduled"}
              </p>
              <p className="mt-1 text-slate-600">
                {lastRun.finishedAt
                  ? `${lastRun.birthdaysFound} birthdays · ${lastRun.sentCount} sent · ${lastRun.failedCount} failed · ${lastRun.skippedCount} skipped`
                  : "Didn't finish: it may have run out of time or hit an error."}
              </p>
              {lastRun.note && <p className="mt-1 text-xs text-slate-500">{lastRun.note}</p>}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">The job hasn&apos;t run yet.</p>
          )}
        </Card>

        <Card title={`Coming up in the next ${UPCOMING_DAYS} days`}>
          {stats.upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No birthdays in the next {UPCOMING_DAYS} days.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {stats.upcoming.map((employee) => (
                <li key={employee.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {employee.name}
                    {!employee.whatsappConsent && <span className="ml-2 text-xs text-slate-400">no consent</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatBirthday({ day: employee.birthDay, month: employee.birthMonth, year: null })} ·{" "}
                    {employee.inDays === 1 ? "tomorrow" : `in ${employee.inDays} days`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const content = (
    <>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-red-700" : "text-slate-900"}`}>
        {value.toLocaleString("en-IN")}
      </dd>
    </>
  );
  const className = "block rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs";
  return href ? (
    <Link href={href} className={`${className} transition hover:border-slate-300`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function TodaysBirthdays() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
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
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">🎂 {row.name}</p>
                <p className="text-xs text-slate-500">{formatPhone(row.phone)}</p>
                {row.errorMessage && row.status !== "sent" && (
                  <p className="mt-1 text-xs text-red-700">{row.errorMessage}</p>
                )}
              </div>
              {!row.whatsappConsent ? (
                <Badge tone="slate">No consent</Badge>
              ) : row.status === null ? (
                <Badge tone="slate">Waiting</Badge>
              ) : (
                <SendStatusBadge log={{ status: row.status, attempts: row.attempts ?? 0, errorMessage: row.errorMessage }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
