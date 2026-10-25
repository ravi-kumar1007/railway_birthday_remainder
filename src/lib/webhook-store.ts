import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { STATUS_RANKS, type StatusUpdate, type TemplateUpdate } from "./webhook";

const { sendLogs, templates } = schema;

// SQL version of isStatusUpgrade's ranking. The values are constants from code, not input.
const currentRank = sql.raw(
  `case "send_logs"."status" ${Object.entries(STATUS_RANKS)
    .map(([status, rank]) => `when '${status}' then ${rank}`)
    .join(" ")} end`,
);

/**
 * Applies a webhook's updates in one batch (one transaction). Each status update is a conditional
 * UPDATE that only moves a send forward, so duplicate or out-of-order webhooks are harmless. Unknown
 * message ids, such as test messages, match no row.
 */
export async function applyWebhookUpdates({
  statuses,
  templates: templateUpdates,
}: {
  statuses: StatusUpdate[];
  templates: TemplateUpdate[];
}): Promise<void> {
  const db = getDb();
  const statements = [
    ...statuses.map((update) =>
      db
        .update(sendLogs)
        .set({
          status: update.status,
          // A later sent/delivered/read supersedes an earlier failure
          errorCode: update.status === "failed" ? update.errorCode : null,
          errorMessage: update.status === "failed" ? update.errorMessage : null,
        })
        .where(
          and(
            eq(sendLogs.waMessageId, update.waMessageId),
            // A queued send is mid-attempt (or its outcome is unknown); only the sender changes it
            ne(sendLogs.status, "queued"),
            sql`${currentRank} < ${STATUS_RANKS[update.status]}`,
          ),
        ),
    ),
    ...templateUpdates.map((update) =>
      db
        .update(templates)
        .set(update.status ? { status: update.status, rejectionReason: update.note } : { rejectionReason: update.note })
        .where(eq(templates.metaTemplateId, update.metaTemplateId)),
    ),
  ];
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}
