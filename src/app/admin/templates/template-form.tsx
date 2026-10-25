"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FreshOnReturn } from "@/components/fresh-on-return";
import { MessagePreview } from "@/components/message-preview";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/styles";
import {
  MAX_BODY_LENGTH,
  NAME_VARIABLE,
  normalizeTemplateName,
  renderTemplate,
  TEMPLATE_LANGUAGES,
  templateBodyProblem,
} from "@/lib/templates";
import { createTemplate, type TemplateField } from "./actions";

const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME;
const DEFAULT_BODY = `Happy birthday, {{1}}! 🎉 Wishing you a wonderful year ahead from everyone at ${companyName || "the team"}.`;

export function TemplateForm({ metaReady }: { metaReady: boolean }) {
  return (
    <FreshOnReturn>
      <TemplateFormFields metaReady={metaReady} />
    </FreshOnReturn>
  );
}

function TemplateFormFields({ metaReady }: { metaReady: boolean }) {
  const [state, formAction, pending] = useActionState(createTemplate, {});
  // Controlled, so the preview and checks follow every keystroke
  const [name, setName] = useState("birthday_wish");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [example, setExample] = useState("Priya");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const errors = state.fieldErrors ?? {};

  const savedName = normalizeTemplateName(name);
  const nameProblem = savedName && !/^[a-z0-9_]+$/.test(savedName) ? "Use only letters, numbers and underscores." : null;
  const bodyProblem = templateBodyProblem(body);

  // Submitted by hand rather than through <form action>, which would reset these controlled fields
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  function insertName() {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + NAME_VARIABLE + body.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + NAME_VARIABLE.length, start + NAME_VARIABLE.length);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field id="name" label="Template name" error={errors.name ?? nameProblem}>
            <input
              id="name"
              name="name"
              required
              maxLength={512}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={errors.name || nameProblem ? true : undefined}
              aria-describedby="name-hint"
              className={`${inputClass} font-mono`}
            />
            <p id="name-hint" className="mt-1.5 text-xs text-slate-500">
              {savedName && savedName !== name ? (
                <>
                  Saved as <span className="font-mono">{savedName}</span>.{" "}
                </>
              ) : null}
              Only you see it.
            </p>
          </Field>

          <Field id="language" label="Language" error={errors.language}>
            <select id="language" name="language" defaultValue="en" className={inputClass}>
              {TEMPLATE_LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label} ({code})
                </option>
              ))}
            </select>
          </Field>

          <Field id="bodyText" label="Message" error={errors.bodyText} className="sm:col-span-2">
            <textarea
              id="bodyText"
              name="bodyText"
              ref={bodyRef}
              required
              rows={6}
              maxLength={MAX_BODY_LENGTH + 100}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-invalid={errors.bodyText || bodyProblem ? true : undefined}
              aria-describedby="bodyText-hint"
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <div id="bodyText-hint" className="mt-1.5 flex flex-wrap items-start justify-between gap-2 text-xs">
              <p className={bodyProblem ? "text-amber-700" : "text-slate-500"}>
                {bodyProblem ?? (
                  <>
                    {NAME_VARIABLE} is replaced with the employee&apos;s name. *bold*, _italic_ and ~strike~ work as in
                    WhatsApp.
                  </>
                )}
              </p>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-slate-400">
                  {body.trim().length}/{MAX_BODY_LENGTH}
                </span>
                <button
                  type="button"
                  onClick={insertName}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono font-medium text-slate-700 hover:bg-slate-200"
                >
                  Insert {NAME_VARIABLE}
                </button>
              </span>
            </div>
          </Field>

          <Field id="exampleValue" label="Sample name for Meta's review" error={errors.exampleValue}>
            <input
              id="exampleValue"
              name="exampleValue"
              required
              maxLength={60}
              autoComplete="off"
              value={example}
              onChange={(event) => setExample(event.target.value)}
              aria-invalid={errors.exampleValue ? true : undefined}
              className={inputClass}
            />
          </Field>

          <div className="text-sm sm:pt-7">
            <p className="font-medium text-slate-700">Category: Marketing</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Meta counts birthday wishes as marketing messages and charges for each one sent.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mr-auto">
              {state.error}
            </p>
          )}
          {!metaReady && !state.error && (
            <p className="text-xs text-slate-500 sm:mr-auto">
              Meta isn&apos;t connected yet, so this is saved as a draft to submit later.
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Link href="/admin/templates" className={secondaryButtonClass}>
              Cancel
            </Link>
            <button type="submit" disabled={pending || Boolean(bodyProblem)} className={primaryButtonClass}>
              {pending ? "Saving…" : metaReady ? "Submit to Meta for review" : "Save as draft"}
            </button>
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-sm font-medium text-slate-700">Preview</h2>
        <p className="mt-0.5 mb-3 text-xs text-slate-500">How {example.trim() || "the employee"} sees it at noon.</p>
        <MessagePreview text={renderTemplate(body.trim() || " ", example.trim() || "Priya")} />
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: TemplateField;
  label: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
