"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { uniqueViolation } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/birthday";
import { employeeInputSchema, type EmployeeInput } from "@/lib/employee-schema";
import { findEmployeeWith } from "@/lib/employees";
import { isUuid } from "@/lib/ids";
import { describeError } from "@/lib/log";

const { employees } = schema;

export type EmployeeField = "name" | "phone" | "empCode" | "birthday";

export type EmployeeFormValues = {
  name: string;
  phone: string;
  empCode: string;
  /** YYYY-MM-DD from the date input */
  birthday: string;
  yearUnknown: boolean;
  whatsappConsent: boolean;
};

export type EmployeeFormState = {
  error?: string;
  fieldErrors?: Partial<Record<EmployeeField, string>>;
  // Sent back so the form can refill itself: React resets uncontrolled fields after every action
  values?: EmployeeFormValues;
};

function readForm(formData: FormData): EmployeeFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    phone: text("phone"),
    empCode: text("empCode"),
    birthday: text("birthday"),
    yearUnknown: formData.get("yearUnknown") === "on",
    whatsappConsent: formData.get("whatsappConsent") === "on",
  };
}

function validate(
  values: EmployeeFormValues,
): { ok: true; data: EmployeeInput } | { ok: false; fieldErrors: EmployeeFormState["fieldErrors"] } {
  const date = parseDateInput(values.birthday);
  const parsed = employeeInputSchema.safeParse({
    name: values.name,
    phone: values.phone,
    empCode: values.empCode,
    birthDay: date?.day,
    birthMonth: date?.month,
    birthYear: date && !values.yearUnknown ? date.year : null,
    whatsappConsent: values.whatsappConsent,
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Partial<Record<EmployeeField, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (key === "birthDay" || key === "birthMonth" || key === "birthYear") {
      fieldErrors.birthday ??= date ? issue.message : "Choose a date of birth.";
    } else if (key === "name" || key === "phone" || key === "empCode") {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { ok: false, fieldErrors };
}

/** Turns a failed insert/update into a message, naming who already has the phone or code */
async function saveFailure(error: unknown, data: EmployeeInput): Promise<EmployeeFormState> {
  const constraint = uniqueViolation(error);
  const field =
    constraint === "employees_phone_unique" ? "phone" : constraint === "employees_emp_code_unique" ? "empCode" : null;
  if (field) {
    const holder = await findEmployeeWith(field, field === "phone" ? data.phone : (data.empCode ?? "")).catch(
      () => null,
    );
    const who = holder ? `${holder.name}${holder.isActive ? "" : " (inactive)"}` : "another employee";
    return { fieldErrors: { [field]: `Already used by ${who}.` } };
  }
  console.error("Saving employee failed:", describeError(error));
  return { error: "Could not save the employee. Check the database connection and try again." };
}

export async function addEmployee(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  await requireAdmin();
  const values = readForm(formData);
  const result = validate(values);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  try {
    await getDb().insert(employees).values(result.data);
  } catch (error) {
    return { ...(await saveFailure(error, result.data)), values };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/employees?notice=added");
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireAdmin();
  const values = readForm(formData);
  if (!isUuid(id)) return { error: "This employee no longer exists.", values };
  const result = validate(values);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  try {
    const updated = await getDb()
      .update(employees)
      .set(result.data)
      .where(eq(employees.id, id))
      .returning({ id: employees.id });
    if (updated.length === 0) return { error: "This employee no longer exists.", values };
  } catch (error) {
    return { ...(await saveFailure(error, result.data)), values };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/employees?notice=updated");
}

/** Soft delete: inactive employees stay in the database but never get messages */
export async function setEmployeeActive(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  if (!isUuid(id) || typeof active !== "boolean") redirect("/admin/employees");

  await getDb().update(employees).set({ isActive: active }).where(eq(employees.id, id));

  revalidatePath("/admin", "layout");
  redirect(`/admin/employees?notice=${active ? "reactivated" : "deactivated"}`);
}
