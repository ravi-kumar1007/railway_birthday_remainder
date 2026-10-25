import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { dangerButtonClass, secondaryButtonClass } from "@/components/styles";
import { SubmitButton } from "@/components/submit-button";
import { toDateInputValue } from "@/lib/birthday";
import { todayInTimeZone, toIsoDate } from "@/lib/dates";
import { getEmployee } from "@/lib/employees";
import { setEmployeeActive, updateEmployee } from "../actions";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: PageProps<"/admin/employees/[id]">) {
  const { id } = await params;
  await connection();
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const { isActive } = employee;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={employee.name}
        description={isActive ? "Edit this employee's details." : "Inactive: this employee doesn't get birthday wishes."}
      />
      <EmployeeForm
        action={updateEmployee.bind(null, employee.id)}
        initial={{
          name: employee.name,
          phone: employee.phone,
          empCode: employee.empCode ?? "",
          birthday: toDateInputValue({ day: employee.birthDay, month: employee.birthMonth, year: employee.birthYear }),
          yearUnknown: employee.birthYear === null,
          whatsappConsent: employee.whatsappConsent,
        }}
        submitLabel="Save changes"
        maxDate={toIsoDate(todayInTimeZone())}
      />

      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-sm font-semibold">{isActive ? "Deactivate employee" : "Reactivate employee"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isActive
              ? "Stops birthday wishes and hides them from the main list. Their details and send history are kept, and you can reactivate them at any time."
              : "Birthday wishes start again, as long as they've agreed to WhatsApp messages."}
          </p>
        </div>
        <form action={setEmployeeActive.bind(null, employee.id, !isActive)} className="shrink-0">
          <SubmitButton
            pendingText={isActive ? "Deactivating…" : "Reactivating…"}
            className={isActive ? dangerButtonClass : secondaryButtonClass}
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
