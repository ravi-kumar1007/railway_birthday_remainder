import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { primaryButtonClass } from "@/components/styles";
import { rethrowNextErrors } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { metaConfigProblem } from "@/lib/env";
import { describeError } from "@/lib/log";
import { listTemplates } from "@/lib/template-store";
import { TemplatesPanel } from "./templates-panel";

export const metadata: Metadata = { title: "Templates" };

const NOTICES = {
  submitted:
    "Template sent to Meta for review. Approval usually takes a few minutes, sometimes up to a day; this page checks again each time you open it.",
  draft: "The template was saved as a draft but not sent to Meta. The reason is shown on it below.",
};

export default function TemplatesPage({ searchParams }: PageProps<"/admin/templates">) {
  return (
    <>
      <PageHeader
        title="Message templates"
        description="WhatsApp only delivers birthday wishes through a template that Meta has approved."
        actions={
          <Link href="/admin/templates/new" className={primaryButtonClass}>
            New template
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Templates searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Templates({ searchParams }: Pick<PageProps<"/admin/templates">, "searchParams">) {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  const { notice } = await searchParams;
  let templates: Awaited<ReturnType<typeof listTemplates>>;
  try {
    templates = await listTemplates();
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading templates failed:", describeError(error));
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">
        Could not load the templates. Check the database connection, then reload the page.
      </p>
    );
  }

  return (
    <TemplatesPanel
      templates={templates}
      metaProblem={metaConfigProblem()}
      notice={typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice as keyof typeof NOTICES] : undefined}
    />
  );
}
