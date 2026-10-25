"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { runBirthdayJob } from "@/lib/birthday-job";
import type { RunSummary } from "@/lib/birthday-run";
import { birthdayStore } from "@/lib/birthday-store";
import { metaConfigProblem } from "@/lib/env";
import { describeError, maskPhone } from "@/lib/log";
import { sendTemplateMessage } from "@/lib/meta/messages-api";
import { normalizePhone } from "@/lib/phone";
import { isUsableForBirthdays } from "@/lib/template-sync";

export type RunNowResult = { ok: true; summary: RunSummary } | { ok: false; error: string };

/** The same run cron-job.org starts at noon; anyone already wished today is skipped */
export async function runBirthdaysNow(): Promise<RunNowResult> {
  await requireAdmin();
  try {
    const summary = await runBirthdayJob("admin");
    revalidatePath("/admin", "layout");
    return { ok: true, summary };
  } catch (error) {
    console.error("Birthday run failed:", describeError(error));
    return { ok: false, error: "The run failed. Check the database connection and try again." };
  }
}

export type TestMessageState = {
  result?: { ok: boolean; message: string };
  values?: { phone: string; name: string };
};

/** Sends the active template to any number. Not recorded as a birthday wish. */
export async function sendTestMessage(_prev: TestMessageState, formData: FormData): Promise<TestMessageState> {
  await requireAdmin();
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values = { phone: text("phone"), name: text("name") };
  const fail = (message: string): TestMessageState => ({ result: { ok: false, message }, values });

  const phone = normalizePhone(values.phone);
  if (!phone.ok) return fail(phone.error);
  const name = values.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) return fail("Enter the name to put in the message.");

  const problem = metaConfigProblem();
  if (problem) return fail(`Meta isn't connected: ${problem}`);

  let template: Awaited<ReturnType<typeof birthdayStore.getActiveTemplate>>;
  try {
    template = await birthdayStore.getActiveTemplate();
  } catch (error) {
    console.error("Loading the active template failed:", describeError(error));
    return fail("Could not load the active template. Check the database connection.");
  }
  if (!template || !isUsableForBirthdays(template)) {
    return fail("There's no active approved template to send. Choose one on the Templates page.");
  }

  const outcome = await sendTemplateMessage(
    { to: phone.phone, templateName: template.name, language: template.language, name },
    8000,
  );
  console.info(`Test message ${outcome.ok ? "sent to" : "failed for"} ${maskPhone(phone.phone)}`);
  if (outcome.ok) {
    return {
      result: { ok: true, message: `Sent with ${template.name}; it should arrive within a minute. Meta message id: ${outcome.waMessageId}` },
      values,
    };
  }
  return fail(
    outcome.definite
      ? `Meta didn't send it: ${outcome.message}`
      : `No answer from Meta (${outcome.message}). Check the phone before trying again.`,
  );
}
