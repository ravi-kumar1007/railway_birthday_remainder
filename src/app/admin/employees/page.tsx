import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Employees" };

export default function EmployeesPage() {
  return (
    <>
      <PageHeader title="Employees" description="Add, edit and export employees." />
      <ComingSoon phase={2}>Employee table with search, filters, add/edit/deactivate and CSV export.</ComingSoon>
    </>
  );
}
