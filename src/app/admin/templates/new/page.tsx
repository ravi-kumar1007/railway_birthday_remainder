import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { requireAdmin } from "@/lib/auth/session";
import { metaConfigProblem } from "@/lib/env";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New template" };

export default function NewTemplatePage() {
  return (
    <>
      <PageHeader
        title="New template"
        description="Meta reviews every template before it can be sent. Review usually takes a few minutes, sometimes up to a day."
      />
      <Suspense fallback={<Skeleton className="h-[34rem]" />}>
        <NewTemplateForm />
      </Suspense>
    </>
  );
}

async function NewTemplateForm() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  // Read the Meta settings per request, not at build time
  await connection();
  return <TemplateForm metaReady={metaConfigProblem() === null} />;
}
