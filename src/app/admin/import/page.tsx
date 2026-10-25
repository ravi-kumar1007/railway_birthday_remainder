import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import employees"
        description="Add or update employees from Excel, CSV or PDF. The file is read in your browser, and only the rows you import are sent."
      />
      <Importer />
    </>
  );
}
