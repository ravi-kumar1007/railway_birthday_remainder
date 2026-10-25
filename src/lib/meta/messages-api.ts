import "server-only";
import { EnvError, metaEnv } from "@/lib/env";
import { graphRequest, MetaApiError } from "./graph";

export type TemplateMessage = { to: string; templateName: string; language: string; name: string };

/**
 * ok: Meta accepted it. definite: Meta refused it or it never left, so trying again can't
 * double-send. Not definite: no answer, so it may have been sent and must not be retried automatically.
 */
export type SendOutcome =
  | { ok: true; waMessageId: string }
  | { ok: false; definite: true; code: string; message: string }
  | { ok: false; definite: false; message: string };

/** Sends an approved template whose only variable, {{1}}, is the recipient's name */
export async function sendTemplateMessage(message: TemplateMessage, timeoutMs: number): Promise<SendOutcome> {
  try {
    const result = await graphRequest<{ messages?: { id: string }[] }>(`${metaEnv().META_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      timeoutMs,
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        // Meta wants the number with its country code but without the +
        to: message.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: message.templateName,
          language: { code: message.language },
          components: [{ type: "body", parameters: [{ type: "text", text: message.name }] }],
        },
      },
    });
    const waMessageId = result.messages?.[0]?.id;
    return waMessageId
      ? { ok: true, waMessageId }
      : { ok: false, definite: false, message: "Meta answered without a message id." };
  } catch (error) {
    if (error instanceof MetaApiError) {
      return error.outcome === "unknown"
        ? { ok: false, definite: false, message: error.message }
        : { ok: false, definite: true, code: String(error.code ?? (error.status || "network")), message: error.message };
    }
    if (error instanceof EnvError) return { ok: false, definite: true, code: "config", message: error.message };
    throw error;
  }
}
