"use client";

import { useActionState } from "react";
import { FreshOnReturn } from "@/components/fresh-on-return";
import { primaryButtonClass } from "@/components/styles";
import { nameForMessage, type NameFormat } from "@/lib/names";
import { saveNameFormat } from "./actions";

const EXAMPLE = "Dr. Priya Sharma";

const OPTIONS: { value: NameFormat; title: string }[] = [
  { value: "first", title: "First name" },
  { value: "full", title: "Full name" },
];

export function NameFormatForm({ current }: { current: NameFormat }) {
  return (
    <FreshOnReturn>
      <NameFormatFields current={current} />
    </FreshOnReturn>
  );
}

function NameFormatFields({ current }: { current: NameFormat }) {
  const [state, formAction, pending] = useActionState(saveNameFormat, {});

  return (
    <form action={formAction}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Name in the message</legend>
        {OPTIONS.map(({ value, title }) => (
          <label
            key={value}
            className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 transition has-checked:border-emerald-500 has-checked:bg-emerald-50/50 has-checked:ring-1 has-checked:ring-emerald-500"
          >
            <input
              type="radio"
              name="nameFormat"
              value={value}
              defaultChecked={current === value}
              className="mt-0.5 size-4 shrink-0 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">{title}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {EXAMPLE} gets &ldquo;Happy birthday, {nameForMessage(EXAMPLE, value)}!&rdquo;
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && (
          <p role="status" className="text-sm text-emerald-700">
            Saved. The next wishes use it.
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
