import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" description="WhatsApp message templates approved by Meta." />
      <ComingSoon phase={4}>Create templates, submit them to Meta for approval and choose the active one.</ComingSoon>
    </>
  );
}
