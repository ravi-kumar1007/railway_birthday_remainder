"use client";

import Link from "next/link";
import { useActionState, useLayoutEffect, useState, type ReactNode } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/styles";
import type { EmployeeField, EmployeeFormState, EmployeeFormValues } from "./actions";

type Props = {
  action: (state: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  initial: EmployeeFormValues;
  submitLabel: string;
  /** Latest selectable date of birth (today in IST), YYYY-MM-DD */
  maxDate: string;
};

export function EmployeeForm(props: Props) {
  // Next.js keeps visited pages mounted but hidden (Activity). Remount the form whenever it is hidden,
  // so coming back shows the saved values instead of a stale draft or error.
  const [instance, setInstance] = useState(0);
  useLayoutEffect(() => () => setInstance((n) => n + 1), []);
  return <EmployeeFormFields key={instance} {...props} />;
}

function EmployeeFormFields({ action, initial, submitLabel, maxDate }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  const errors = state.fieldErrors ?? {};

  const control = (name: EmployeeField, hasHint = false) => ({
    id: name,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby":
      [hasHint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <Field name="name" label="Full name" error={errors.name} className="sm:col-span-2">
          <input
            {...control("name")}
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            defaultValue={values.name}
            className={inputClass}
          />
        </Field>

        <Field
          name="phone"
          label="WhatsApp number"
          hint="10-digit Indian numbers get +91 added. For other countries, start with + and the country code."
          error={errors.phone}
        >
          <input
            {...control("phone", true)}
            type="tel"
            inputMode="tel"
            required
            maxLength={25}
            autoComplete="off"
            placeholder="98765 43210"
            defaultValue={values.phone}
            className={inputClass}
          />
        </Field>

        <Field name="empCode" label="Employee code (optional)" error={errors.empCode}>
          <input
            {...control("empCode")}
            type="text"
            maxLength={50}
            autoComplete="off"
            defaultValue={values.empCode}
            className={inputClass}
          />
        </Field>

        <Field
          name="birthday"
          label="Date of birth"
          hint="The wish goes out on this day and month every year."
          error={errors.birthday}
        >
          <input
            {...control("birthday", true)}
            type="date"
            required
            min="1900-01-01"
            max={maxDate}
            defaultValue={values.birthday}
            className={inputClass}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="yearUnknown"
              defaultChecked={values.yearUnknown}
              className="size-4 rounded border-slate-300 accent-emerald-600"
            />
            Year not known (only the day and month are saved)
          </label>
        </Field>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
          <input
            type="checkbox"
            name="whatsappConsent"
            defaultChecked={values.whatsappConsent}
            className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-emerald-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">Agreed to receive WhatsApp messages</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Birthday wishes are only sent to employees who have agreed.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mr-auto">
            {state.error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link href="/admin/employees" className={secondaryButtonClass}>
            Cancel
          </Link>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  className,
  children,
}: {
  name: EmployeeField;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
