import { createHmac, timingSafeEqual } from "node:crypto";
import type { SendLog, Template } from "@/db/schema";
import { mapMetaStatus, rejectionText } from "./template-sync";

// Meta's WhatsApp webhook: message delivery statuses and template review events.

type SendStatus = SendLog["status"];

export type StatusUpdate = {
  waMessageId: string;
  status: Exclude<SendStatus, "queued">;
  errorCode: string | null;
  errorMessage: string | null;
};

/** status null: the status is unchanged and only the note is news */
export type TemplateUpdate = { metaTemplateId: string; status: Template["status"] | null; note: string | null };

/** Checks X-Hub-Signature-256: an HMAC-SHA256 of the exact raw body, keyed with the app secret */
export function verifyWebhookSignature(rawBody: string | Buffer, header: string | null, appSecret: string): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header ?? "");
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[1], "hex"));
}

// Statuses only move forward. Webhooks can arrive out of order, and a read message may never get a
// "delivered" webhook at all. A failure outranks "sent"; proof of delivery outranks a failure.
const RANK: Record<SendStatus, number> = { queued: 0, sent: 1, failed: 2, delivered: 3, read: 4 };

export function isStatusUpgrade(current: SendStatus, incoming: SendStatus): boolean {
  return RANK[incoming] > RANK[current];
}

export const STATUS_RANKS = RANK;

const MESSAGE_STATUSES = new Set<string>(["sent", "delivered", "read", "failed"]);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function statusUpdate(raw: unknown): StatusUpdate | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.status !== "string") return null;
  if (!MESSAGE_STATUSES.has(raw.status)) return null;

  const error = list(raw.errors).find(isObject);
  const title = error && typeof error.title === "string" ? error.title : null;
  const details = error && isObject(error.error_data) && typeof error.error_data.details === "string" ? error.error_data.details : null;
  return {
    waMessageId: raw.id,
    status: raw.status as StatusUpdate["status"],
    errorCode: error && error.code !== undefined ? String(error.code) : null,
    errorMessage: [title, details && details !== title ? details : null].filter(Boolean).join(" ") || null,
  };
}

function templateUpdate(raw: unknown): TemplateUpdate | null {
  if (!isObject(raw) || typeof raw.event !== "string" || raw.message_template_id === undefined) return null;
  const metaTemplateId = String(raw.message_template_id);
  const reason = typeof raw.reason === "string" ? raw.reason : undefined;

  switch (raw.event) {
    case "REJECTED":
      return { metaTemplateId, status: "REJECTED", note: rejectionText(reason) };
    case "REINSTATED":
      return { metaTemplateId, status: "APPROVED", note: null };
    case "FLAGGED":
      return { metaTemplateId, status: null, note: "Flagged by Meta after negative feedback; it may be paused or disabled." };
    case "APPROVED":
    case "PENDING":
    case "IN_APPEAL":
    case "PAUSED":
    case "DISABLED":
    case "PENDING_DELETION":
    case "DELETED":
    case "ARCHIVED":
    case "LIMIT_EXCEEDED": {
      const { status, note } = mapMetaStatus(raw.event);
      return { metaTemplateId, status, note };
    }
    default:
      // UNARCHIVED, LOCKED and future events don't say what the status is now; a page refresh syncs it
      return null;
  }
}

/** Pulls the updates this app cares about out of a webhook payload, ignoring anything it doesn't recognise */
export function parseWebhook(payload: unknown): { statuses: StatusUpdate[]; templates: TemplateUpdate[] } {
  const result = { statuses: [] as StatusUpdate[], templates: [] as TemplateUpdate[] };
  if (!isObject(payload)) return result;

  for (const entry of list(payload.entry)) {
    if (!isObject(entry)) continue;
    for (const change of list(entry.changes)) {
      if (!isObject(change) || !isObject(change.value)) continue;
      if (change.field === "message_template_status_update") {
        const update = templateUpdate(change.value);
        if (update) result.templates.push(update);
      } else {
        for (const raw of list(change.value.statuses)) {
          const update = statusUpdate(raw);
          if (update) result.statuses.push(update);
        }
      }
    }
  }
  return result;
}
