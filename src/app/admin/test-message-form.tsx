"use client";

import { useActionState } from "react";
import { FreshOnReturn } from "@/components/fresh-on-return";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { sendTestMessage } from "./actions";

export function TestMessageForm() {
  return (
    <FreshOnReturn>
      <TestMessageFields />
    </FreshOnReturn>
  );
}

function TestMessageFields() {
  const [state, formAction, pending] = useActionState(sendTestMessage, {});

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="text-sm font-semibold">Send a test message</h2>
      <p className="mt-1 text-xs text-slate-500">
        Sends the active template to any number. It isn&apos;t recorded as anyone&apos;s birthday wish.
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label htmlFor="test-phone" className="text-sm font-medium text-slate-700">
            WhatsApp number
          </label>
          <input
            id="test-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            maxLength={25}
            placeholder="98765 43210"
            defaultValue={state.values?.phone}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="test-name" className="text-sm font-medium text-slate-700">
            Name in the message
          </label>
          <input
            id="test-name"
            name="name"
            required
            maxLength={60}
            defaultValue={state.values?.name ?? "Test"}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
          {pending ? "Sending…" : "Send test message"}
        </button>
        {state.result && (
          <p
            role={state.result.ok ? "status" : "alert"}
            className={`rounded-lg px-3 py-2 text-sm break-words ${
              state.result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            {state.result.message}
          </p>
        )}
      </form>
    </section>
  );
}
