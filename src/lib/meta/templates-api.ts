import "server-only";
import { metaEnv } from "@/lib/env";
import type { MetaTemplate } from "@/lib/template-sync";
import { toMetaTemplatePayload, type TemplateInput } from "@/lib/templates";
import { graphRequest } from "./graph";

const TEMPLATE_FIELDS = "id,name,language,status,category,rejected_reason,parameter_format,components";
const PAGE_SIZE = 100;
// A WhatsApp Business Account rarely has more than a few hundred templates
const MAX_PAGES = 20;

/** Submits a template for review. Meta answers with its id and first status, usually PENDING. */
export async function createMetaTemplate(input: TemplateInput) {
  return graphRequest<{ id: string; status: string; category: string }>(`${metaEnv().META_WABA_ID}/message_templates`, {
    method: "POST",
    body: toMetaTemplatePayload(input),
  });
}

/** Every template in the WhatsApp Business Account, following the paging cursor */
export async function listMetaTemplates(): Promise<MetaTemplate[]> {
  const templates: MetaTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await graphRequest<{ data: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${metaEnv().META_WABA_ID}/message_templates`,
      { query: { fields: TEMPLATE_FIELDS, limit: PAGE_SIZE, after } },
    );
    templates.push(...result.data);
    after = result.paging?.cursors?.after;
    if (!result.paging?.next || !after) break;
  }
  return templates;
}

/** Deletes one language version. Deleting by name alone would remove every language. */
export async function deleteMetaTemplate({ metaTemplateId, name }: { metaTemplateId: string; name: string }) {
  await graphRequest<{ success: boolean }>(`${metaEnv().META_WABA_ID}/message_templates`, {
    method: "DELETE",
    query: { hsm_id: metaTemplateId, name },
  });
}
