"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { uniqueViolation } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { EnvError, metaConfigProblem } from "@/lib/env";
import { describeError } from "@/lib/log";
import { MetaApiError } from "@/lib/meta/graph";
import { createMetaTemplate, deleteMetaTemplate, listMetaTemplates } from "@/lib/meta/templates-api";
import { applyTemplateSync, getTemplate, listTemplates, setActiveTemplate } from "@/lib/template-store";
import { DELETED_IN_META, isUsableForBirthdays, mapMetaStatus, planTemplateSync } from "@/lib/template-sync";
import { TEMPLATE_CATEGORY, templateInputSchema, type TemplateInput } from "@/lib/templates";

const { templates } = schema;

export type TemplateField = keyof TemplateInput;

export type TemplateFormValues = Record<TemplateField, string>;

export type TemplateFormState = {
  error?: string;
  fieldErrors?: Partial<Record<TemplateField, string>>;
  // Sent back so the form can refill itself: React resets uncontrolled fields after every action
  values?: TemplateFormValues;
};

export type SyncResult =
  | { ok: true; updated: number; imported: number; skipped: { name: string; language: string; reason: string }[] }
  | { ok: false; error: string };

export type DeleteResult = { error?: string };

function metaMessage(error: unknown): string {
  if (error instanceof MetaApiError || error instanceof EnvError) return error.message;
  console.error("Meta request failed:", describeError(error));
  return "Something went wrong while talking to Meta.";
}

/**
 * Sends a saved draft to Meta for review and records the outcome on the row. A refusal is kept on
 * the draft (rejection_reason) so the templates page can show it next to a "Submit" button.
 */
async function submitDraft(id: string, input: TemplateInput): Promise<boolean> {
  const db = getDb();
  let created: Awaited<ReturnType<typeof createMetaTemplate>>;
  try {
    created = await createMetaTemplate(input);
  } catch (error) {
    await db
      .update(templates)
      .set({ rejectionReason: `Not sent to Meta: ${metaMessage(error)}` })
      .where(eq(templates.id, id));
    return false;
  }
  const { status, note } = mapMetaStatus(created.status);
  // If this write fails, the next status refresh links the draft to Meta's template by name and language
  await db
    .update(templates)
    .set({ metaTemplateId: created.id, status, category: created.category ?? TEMPLATE_CATEGORY, rejectionReason: note })
    .where(eq(templates.id, id));
  return true;
}

export async function createTemplate(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  await requireAdmin();
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: TemplateFormValues = {
    name: text("name"),
    language: text("language"),
    bodyText: text("bodyText"),
    exampleValue: text("exampleValue"),
  };

  const parsed = templateInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: TemplateFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as TemplateField] ??= issue.message;
    return { fieldErrors, values };
  }
  const input = parsed.data;

  // Saved as a draft first, so nothing typed is lost if Meta refuses it
  let id: string;
  try {
    [{ id }] = await getDb()
      .insert(templates)
      .values({ ...input, category: TEMPLATE_CATEGORY, status: "DRAFT" })
      .returning({ id: templates.id });
  } catch (error) {
    if (uniqueViolation(error) === "templates_name_language_uniq") {
      return { fieldErrors: { name: "There's already a template with this name in this language." }, values };
    }
    console.error("Saving template failed:", describeError(error));
    return { error: "Could not save the template. Check the database connection and try again.", values };
  }

  const submitted = await submitDraft(id, input);
  revalidatePath("/admin", "layout");
  redirect(`/admin/templates?notice=${submitted ? "submitted" : "draft"}`);
}

/** Sends a draft again, after a failure or once Meta is set up */
export async function submitTemplate(id: string): Promise<void> {
  await requireAdmin();
  const template = await getTemplate(id);
  if (template?.status !== "DRAFT") return;
  const parsed = templateInputSchema.safeParse({
    name: template.name,
    language: template.language,
    bodyText: template.bodyText,
    exampleValue: template.exampleValue ?? "",
  });
  if (parsed.success) {
    await submitDraft(template.id, parsed.data);
  } else {
    await getDb()
      .update(templates)
      .set({ rejectionReason: `Not sent to Meta: ${parsed.error.issues[0].message}` })
      .where(eq(templates.id, id));
  }
  revalidatePath("/admin", "layout");
}

async function syncWithMeta(importNew: boolean): Promise<SyncResult> {
  await requireAdmin();
  const problem = metaConfigProblem();
  if (problem) return { ok: false, error: problem };
  try {
    const [saved, meta] = await Promise.all([listTemplates(), listMetaTemplates()]);
    const plan = planTemplateSync(saved, meta, { importNew });
    await applyTemplateSync(plan);
    if (plan.updates.length > 0 || plan.inserts.length > 0) revalidatePath("/admin", "layout");
    return { ok: true, updated: plan.updates.length, imported: plan.inserts.length, skipped: plan.skipped };
  } catch (error) {
    if (error instanceof MetaApiError) return { ok: false, error: error.message };
    console.error("Template sync failed:", describeError(error));
    return { ok: false, error: "Could not update the templates. Check the database connection." };
  }
}

/** Fetches every template's current status from Meta. Runs when the templates page opens, too. */
export async function refreshTemplates(): Promise<SyncResult> {
  return syncWithMeta(false);
}

/** Adds templates that exist in WhatsApp Manager but not in this app */
export async function importTemplatesFromMeta(): Promise<SyncResult> {
  return syncWithMeta(true);
}

export async function activateTemplate(id: string): Promise<void> {
  await requireAdmin();
  const template = await getTemplate(id);
  if (!template || !isUsableForBirthdays(template)) return;
  await setActiveTemplate(template.id);
  revalidatePath("/admin", "layout");
}

/** Deletes the template in WhatsApp Manager, then here */
export async function deleteTemplate(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const template = await getTemplate(id);
  if (!template) return {};

  // Drafts never reached Meta, and Meta refuses to delete what it has disabled or already removed
  const inMeta =
    template.metaTemplateId !== null && template.status !== "DISABLED" && template.rejectionReason !== DELETED_IN_META;
  if (inMeta) {
    try {
      await deleteMetaTemplate({ metaTemplateId: template.metaTemplateId!, name: template.name });
    } catch (error) {
      return {
        error: `Meta couldn't delete it: ${metaMessage(error)} If it's already gone from WhatsApp Manager, refresh the statuses and try again.`,
      };
    }
  }

  try {
    await getDb().delete(templates).where(eq(templates.id, template.id));
  } catch (error) {
    console.error("Deleting template failed:", describeError(error));
    return { error: "Deleted in WhatsApp Manager, but not here. Check the database connection and try again." };
  }
  revalidatePath("/admin", "layout");
  return {};
}
