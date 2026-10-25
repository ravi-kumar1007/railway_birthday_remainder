import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { requireAdmin } from "@/lib/auth/session";
import { todayInTimeZone, toIsoDate } from "@/lib/dates";
import { addEmployee } from "../actions";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default function NewEmployeePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add employee" description="They get a WhatsApp wish on their birthday once they've agreed to it." />
      <Suspense fallback={<Skeleton className="h-[30rem]" />}>
        <NewEmployeeForm />
      </Suspense>
    </div>
  );
}

async function NewEmployeeForm() {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  // Today's date must be read per request, not frozen at build time
  await connection();
  return (
    <EmployeeForm
      action={addEmployee}
      initial={{ name: "", phone: "", empCode: "", birthday: "", yearUnknown: false, whatsappConsent: false }}
      submitLabel="Add employee"
      maxDate={toIsoDate(todayInTimeZone())}
    />
  );
}
