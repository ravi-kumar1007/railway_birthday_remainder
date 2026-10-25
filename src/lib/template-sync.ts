import type { NewTemplate, Template } from "@/db/schema";
import { NAME_VARIABLE, templateVariables } from "./templates";

type TemplateStatus = Template["status"];

/** A template as GET /{WABA_ID}/message_templates returns it (the fields this app asks for) */
export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
  parameter_format?: string;
  components?: MetaComponent[];
};

type MetaComponent = {
  type: string;
  format?: string;
  text?: string;
  example?: { body_text?: string[][] };
  buttons?: { type: string; text?: string; url?: string }[];
};

export type SavedTemplate = Pick<
  Template,
  "id" | "name" | "language" | "metaTemplateId" | "status" | "rejectionReason" | "category" | "bodyText" | "exampleValue"
>;

type SyncedFields = Required<
  Pick<
    NewTemplate,
    "name" | "language" | "bodyText" | "exampleValue" | "category" | "metaTemplateId" | "status" | "rejectionReason"
  >
>;

// Meta has more statuses than the app stores; the rest fold into the nearest one, with a note
const STATUSES: Record<string, { status: TemplateStatus; note: string | null }> = {
  APPROVED: { status: "APPROVED", note: null },
  PENDING: { status: "PENDING", note: null },
  IN_APPEAL: { status: "PENDING", note: "Appeal in progress" },
  REJECTED: { status: "REJECTED", note: null },
  PAUSED: { status: "PAUSED", note: "Paused by Meta after negative feedback from recipients" },
  DISABLED: { status: "DISABLED", note: "Disabled by Meta" },
  PENDING_DELETION: { status: "DISABLED", note: "Being deleted" },
  DELETED: { status: "DISABLED", note: "Deleted" },
  LIMIT_EXCEEDED: { status: "DISABLED", note: "Over the account's template limit" },
  ARCHIVED: { status: "DISABLED", note: "Archived by Meta after 12 months without use" },
};

export function mapMetaStatus(status: string): { status: TemplateStatus; note: string | null } {
  return STATUSES[status] ?? { status: "PENDING", note: `Meta status: ${status}` };
}

const REJECTION_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: "Abusive content",
  INVALID_FORMAT: "Invalid format",
  PROMOTIONAL: "Promotional content",
  TAG_CONTENT_MISMATCH: "Content doesn't match the category",
  SCAM: "Flagged as a scam",
  INCORRECT_CATEGORY: "Wrong category",
};

function rejectionText(reason: string | undefined): string | null {
  if (!reason || reason === "NONE") return null;
  return REJECTION_REASONS[reason] ?? reason.charAt(0) + reason.slice(1).toLowerCase().replaceAll("_", " ");
}

/** Why the cron job couldn't send this template with just the employee's name, or null */
function usabilityProblem(template: MetaTemplate, body: string | undefined): string | null {
  if (template.parameter_format === "NAMED") return "It uses named variables; birthday wishes use {{1}}.";
  if (body === undefined) return "It has no message body.";
  const variables = templateVariables(body);
  if (variables.length === 0) return "Its message has no {{1}} for the employee's name.";
  if (variables.length > 1 || variables[0] !== "1") {
    return `Its message has ${variables.length} variables; birthday wishes fill in only {{1}}.`;
  }

  for (const component of template.components ?? []) {
    switch (component.type) {
      case "BODY":
      case "FOOTER":
        break;
      case "HEADER":
        if (component.format && component.format !== "TEXT") {
          return `It has a ${component.format.toLowerCase()} header, which needs a file for each message.`;
        }
        if (component.text?.includes("{{")) return "Its header has a variable.";
        break;
      case "BUTTONS":
        for (const button of component.buttons ?? []) {
          const fixed = ["QUICK_REPLY", "PHONE_NUMBER", "URL"].includes(button.type);
          if (!fixed || button.url?.includes("{{")) return "It has a button that needs a value for each message.";
        }
        break;
      default:
        return `It has a ${component.type.toLowerCase().replaceAll("_", " ")} section, which isn't supported.`;
    }
  }
  return null;
}

/** Turns a Meta template into this app's fields, plus why it can't be used for birthday wishes (if so) */
export function readMetaTemplate(template: MetaTemplate): { fields: SyncedFields; problem: string | null } {
  const body = template.components?.find((component) => component.type === "BODY");
  const { status, note } = mapMetaStatus(template.status);
  const problem = usabilityProblem(template, body?.text);
  return {
    fields: {
      name: template.name,
      language: template.language,
      bodyText: body?.text ?? "",
      exampleValue: body?.example?.body_text?.[0]?.[0] ?? null,
      category: template.category ?? "MARKETING",
      metaTemplateId: template.id,
      status,
      rejectionReason:
        (status === "REJECTED" ? rejectionText(template.rejected_reason) : note) ??
        (problem && `Can't be used for birthday wishes: ${problem}`),
    },
    problem,
  };
}

export type TemplateSyncPlan = {
  updates: { id: string; set: Partial<SyncedFields> }[];
  inserts: SyncedFields[];
  skipped: { name: string; language: string; reason: string }[];
};

export const DELETED_IN_META = "Not found in WhatsApp Manager; it was probably deleted there.";

/**
 * Brings saved templates in line with Meta's list: statuses, rejection reasons and any edits made in
 * WhatsApp Manager. Saved rows match by Meta id, or drafts by name and language. With importNew,
 * Meta templates that aren't saved yet are added, if a birthday wish can use them.
 */
export function planTemplateSync(
  saved: readonly SavedTemplate[],
  meta: readonly MetaTemplate[],
  { importNew }: { importNew: boolean },
): TemplateSyncPlan {
  const byId = new Map(meta.map((template) => [template.id, template]));
  const byNameAndLanguage = new Map(meta.map((template) => [`${template.name}:${template.language}`, template]));
  const matched = new Set<string>();
  const plan: TemplateSyncPlan = { updates: [], inserts: [], skipped: [] };

  for (const row of saved) {
    const found = row.metaTemplateId
      ? byId.get(row.metaTemplateId)
      : byNameAndLanguage.get(`${row.name}:${row.language}`);

    let set: Partial<SyncedFields>;
    if (found) {
      matched.add(found.id);
      const { fields } = readMetaTemplate(found);
      set = {
        metaTemplateId: fields.metaTemplateId,
        status: fields.status,
        rejectionReason: fields.rejectionReason,
        category: fields.category,
        // Meta is the source of truth if the template was edited in WhatsApp Manager
        ...(fields.bodyText && { bodyText: fields.bodyText }),
        ...(fields.exampleValue && { exampleValue: fields.exampleValue }),
      };
    } else if (row.metaTemplateId) {
      set = { status: "DISABLED", rejectionReason: DELETED_IN_META };
    } else {
      continue;
    }

    const changed = (Object.keys(set) as (keyof typeof set)[]).some((key) => set[key] !== row[key]);
    if (changed) plan.updates.push({ id: row.id, set });
  }

  if (importNew) {
    for (const template of meta) {
      if (matched.has(template.id)) continue;
      const { fields, problem } = readMetaTemplate(template);
      if (problem) plan.skipped.push({ name: template.name, language: template.language, reason: problem });
      else plan.inserts.push(fields);
    }
  }

  return plan;
}

/** Whether the cron job can send this template: approved, with exactly one {{1}} */
export function isUsableForBirthdays(template: Pick<Template, "status" | "bodyText">): boolean {
  const variables = templateVariables(template.bodyText);
  return template.status === "APPROVED" && variables.length === 1 && template.bodyText.includes(NAME_VARIABLE);
}
