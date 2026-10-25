import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { todayInTimeZone, toIsoDate } from "@/lib/dates";
import { addEmployee } from "../actions";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  // Today's date must be read per request, not frozen at build time
  await connection();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Add employee" description="They get a WhatsApp wish on their birthday once they've agreed to it." />
      <EmployeeForm
        action={addEmployee}
        initial={{ name: "", phone: "", empCode: "", birthday: "", yearUnknown: false, whatsappConsent: false }}
        submitLabel="Add employee"
        maxDate={toIsoDate(todayInTimeZone())}
      />
    </div>
  );
}
