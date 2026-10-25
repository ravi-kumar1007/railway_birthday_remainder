"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/badge";
import { MessagePreview } from "@/components/message-preview";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "@/components/styles";
import { SubmitButton } from "@/components/submit-button";
import type { Template } from "@/db/schema";
import { isUsableForBirthdays } from "@/lib/template-sync";
import { languageLabel, renderTemplate } from "@/lib/templates";
import {
  activateTemplate,
  deleteTemplate,
  importTemplatesFromMeta,
  refreshTemplates,
  submitTemplate,
  type SyncResult,
} from "./actions";

const STATUS_BADGES: Record<Template["status"], { label: string; tone: BadgeTone }> = {
  APPROVED: { label: "Approved", tone: "emerald" },
  PENDING: { label: "In review", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "red" },
  PAUSED: { label: "Paused", tone: "amber" },
  DISABLED: { label: "Disabled", tone: "slate" },
  DRAFT: { label: "Draft", tone: "slate" },
};

const smallButton = "!px-3 !py-1.5";

export function TemplatesPanel({
  templates,
  metaProblem,
  notice,
}: {
  templates: Template[];
  metaProblem: string | null;
  notice?: string;
}) {
  const [checking, startCheck] = useTransition();
  const [checked, setChecked] = useState<SyncResult | null>(null);
  const [importing, startImport] = useTransition();
  const [imported, setImported] = useState<SyncResult | null>(null);

  function checkStatuses() {
    startCheck(async () => setChecked(await refreshTemplates()));
  }

  // Ask Meta for the latest statuses each time the page is shown
  useEffect(() => {
    if (!metaProblem) checkStatuses();
  }, [metaProblem]);

  const active = templates.find((template) => template.isActive);

  return (
    <div className="space-y-4">
      {notice && <Banner tone="emerald">{notice}</Banner>}
      {metaProblem ? (
        <Banner tone="amber">
          <strong className="font-semibold">Meta isn&apos;t connected yet,</strong> so templates can be saved as drafts but
          not sent for review. Add the META_ settings to the environment (.env.local, or Netlify&apos;s environment
          variables) and restart. <span className="mt-1 block text-xs">{metaProblem}</span>
        </Banner>
      ) : !active ? (
        <Banner tone="amber">
          <strong className="font-semibold">No active template.</strong> Birthday wishes won&apos;t be sent until you choose
          an approved template below.
        </Banner>
      ) : !isUsableForBirthdays(active) ? (
        <Banner tone="red">
          <strong className="font-semibold">The active template, {active.name}, is {active.status.toLowerCase()}.</strong>{" "}
          Birthday wishes won&apos;t be sent until Meta approves it again or you choose another template.
        </Banner>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={checkStatuses}
            disabled={checking || Boolean(metaProblem)}
            className={`${secondaryButtonClass} ${smallButton}`}
          >
            {checking ? "Checking…" : "Refresh statuses"}
          </button>
          <button
            type="button"
            onClick={() => startImport(async () => setImported(await importTemplatesFromMeta()))}
            disabled={importing || Boolean(metaProblem)}
            className={`${secondaryButtonClass} ${smallButton}`}
          >
            {importing ? "Importing…" : "Import from Meta"}
          </button>
        </div>
        <p role="status" className="text-sm text-slate-500 sm:ml-auto">
          {checking
            ? "Checking statuses with Meta…"
            : checked?.ok
              ? checked.updated > 0
                ? `Checked with Meta just now: ${checked.updated} updated.`
                : "Checked with Meta just now."
              : checked
                ? <span className="text-red-700">Couldn&apos;t check with Meta: {checked.error}</span>
                : null}
        </p>
      </div>

      {imported && <ImportSummary result={imported} />}

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-900">No templates yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create one, or import the ones already in WhatsApp Manager.
          </p>
          <Link href="/admin/templates/new" className={`mt-4 ${primaryButtonClass}`}>
            New template
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} metaReady={!metaProblem} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, metaReady }: { template: Template; metaReady: boolean }) {
  const status = STATUS_BADGES[template.status];
  const usable = isUsableForBirthdays(template);
  const problem = template.status === "REJECTED" || template.status === "DRAFT";

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-xs ${
        template.isActive ? "border-emerald-400 ring-1 ring-emerald-400" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-mono text-sm font-semibold break-all">{template.name}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {languageLabel(template.language)} · {template.category.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {template.isActive && <Badge tone="solid">Used for birthdays</Badge>}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      {template.rejectionReason && (
        <p className={`mt-3 text-sm ${problem ? "text-red-700" : "text-slate-600"}`}>{template.rejectionReason}</p>
      )}

      <div className="mt-4 flex-1">
        <MessagePreview text={renderTemplate(template.bodyText, template.exampleValue || "Priya")} />
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-2">
        {usable && !template.isActive && (
          <form action={activateTemplate.bind(null, template.id)}>
            <SubmitButton pendingText="Saving…" className={`${primaryButtonClass} ${smallButton}`}>
              Use for birthday wishes
            </SubmitButton>
          </form>
        )}
        {template.status === "DRAFT" && metaReady && (
          <form action={submitTemplate.bind(null, template.id)}>
            <SubmitButton pendingText="Sending…" className={`${primaryButtonClass} ${smallButton}`}>
              Submit to Meta
            </SubmitButton>
          </form>
        )}
        <DeleteButton template={template} />
      </div>
    </article>
  );
}

function DeleteButton({ template }: { template: Template }) {
  const [pending, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmAndDelete() {
    const inMeta = template.metaTemplateId !== null && template.status !== "DISABLED";
    const message = [
      `Delete ${template.name} (${languageLabel(template.language)})?`,
      inMeta && "It's deleted in WhatsApp Manager too. Meta doesn't allow reusing an approved template's name for 30 days.",
      template.isActive && "It's the active template, so birthday wishes stop until you choose another.",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!window.confirm(message)) return;
    startDelete(async () => setError((await deleteTemplate(template.id)).error ?? null));
  }

  return (
    <div className="ml-auto text-right">
      <button
        type="button"
        onClick={confirmAndDelete}
        disabled={pending}
        className={`${dangerButtonClass} ${smallButton}`}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-left text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ImportSummary({ result }: { result: SyncResult }) {
  if (!result.ok) return <Banner tone="red">Couldn&apos;t import from Meta: {result.error}</Banner>;
  return (
    <Banner tone={result.imported > 0 ? "emerald" : "slate"}>
      {result.imported > 0
        ? `Imported ${result.imported} template${result.imported === 1 ? "" : "s"} from WhatsApp Manager.`
        : "No new templates to import."}
      {result.skipped.length > 0 && (
        <>
          <span className="mt-2 block">
            Skipped {result.skipped.length}, which can&apos;t be used for birthday wishes:
          </span>
          <ul className="mt-1 list-inside list-disc text-xs">
            {result.skipped.map(({ name, language, reason }) => (
              <li key={`${name}:${language}`}>
                <span className="font-mono">{name}</span> ({languageLabel(language)}): {reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </Banner>
  );
}

const bannerTones = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-800",
  slate: "border-slate-200 bg-white text-slate-700",
};

function Banner({ tone, children }: { tone: keyof typeof bannerTones; children: ReactNode }) {
  return (
    <div role={tone === "red" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${bannerTones[tone]}`}>
      {children}
    </div>
  );
}
