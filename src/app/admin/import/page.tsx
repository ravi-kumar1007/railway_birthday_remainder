import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import" description="Bring employees in from Excel, CSV or PDF." />
      <ComingSoon phase={3}>Upload .xlsx, .xls, .csv or text-based .pdf files, map columns and preview rows before importing.</ComingSoon>
    </>
  );
}
