import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { Skeleton } from "@/components/skeleton";
import { rethrowNextErrors } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { runHealthChecks, type HealthCheck } from "@/lib/health";
import { describeError } from "@/lib/log";
import { getNameFormat } from "@/lib/settings-store";
import { NameFormatForm } from "./name-format-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Check that everything is connected, and choose how names appear in wishes." />
      <div className="space-y-6">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <HealthChecks />
        </Suspense>
        <Section title="Name in the message" description="What replaces {{1}} in the template.">
          <Suspense fallback={<Skeleton className="h-28" />}>
            <NameFormatSection />
          </Suspense>
        </Section>
        <Suspense fallback={<Skeleton className="h-48" />}>
          <SetupAddresses />
        </Suspense>
      </div>
    </>
  );
}

const DOTS: Record<HealthCheck["state"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

async function HealthChecks() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  await connection();
  const checks = await runHealthChecks();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Health check</h2>
        <RefreshButton pendingText="Checking…">Check again</RefreshButton>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        {checks.map((check) => (
          <div key={check.name} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <dt className="flex items-center gap-2 font-medium">
              <span className={`size-2 shrink-0 rounded-full ${DOTS[check.state]}`} aria-hidden />
              {check.name}
              <span className="sr-only">: {check.state === "ok" ? "working" : check.state === "warn" ? "warning" : "problem"}</span>
            </dt>
            <dd className="text-slate-600 [overflow-wrap:anywhere]">{check.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

async function NameFormatSection() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  let current: Awaited<ReturnType<typeof getNameFormat>>;
  try {
    current = await getNameFormat();
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading the name format failed:", describeError(error));
    return <p className="text-sm text-red-700">Could not load this setting. Check the database connection.</p>;
  }
  return <NameFormatForm current={current} />;
}

/** The addresses to paste into Meta and cron-job.org, based on where the app is running */
async function SetupAddresses() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "your-site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${protocol}://${host}`;

  return (
    <Section title="Addresses for setup" description="Paste these into Meta and cron-job.org once the app is deployed.">
      <dl className="space-y-4 text-sm">
        <Address label="WhatsApp webhook (callback URL)" url={`${base}/api/webhooks/whatsapp`}>
          Meta app → WhatsApp → Configuration → Webhook. Verify token: your META_WEBHOOK_VERIFY_TOKEN. Subscribe to
          the <code>messages</code> and <code>message_template_status_update</code> fields.
        </Address>
        <Address label="Daily job (cron-job.org)" url={`${base}/api/cron/send-birthdays`}>
          Every day at 12:00, 12:10 and 12:20, time zone Asia/Kolkata, with the header{" "}
          <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code>.
        </Address>
        <Address label="Privacy policy" url={`${base}/privacy`}>
          Meta app → App settings → Basic → Privacy policy URL. Needed before the app can go live.
        </Address>
      </dl>
    </Section>
  );
}

function Address({ label, url, children }: { label: string; url: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-800">{label}</dt>
      <dd className="mt-1">
        <code className="block rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs break-all text-slate-800 select-all">
          {url}
        </code>
        <p className="mt-1.5 text-xs text-slate-500">{children}</p>
      </dd>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-slate-500">{description}</p>
      {children}
    </section>
  );
}
