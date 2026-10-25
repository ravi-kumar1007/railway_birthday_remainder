import type { Metadata } from "next";
import { count } from "drizzle-orm";
import { Suspense } from "react";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/auth/session";
import { appTimeZone, todayInTimeZone, toIsoDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Birthday stats and the last cron run arrive in Phase 6." />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />}>
        <SetupStatus />
      </Suspense>
    </>
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
    const message = error instanceof Error ? error.message : "Unknown error";
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
