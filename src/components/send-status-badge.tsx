import type { SendLog } from "@/db/schema";
import { MAX_ATTEMPTS, UNKNOWN_OUTCOME } from "@/lib/birthday-run";
import { Badge, type BadgeTone } from "./badge";

const STATUSES: Record<SendLog["status"], { label: string; tone: BadgeTone }> = {
  queued: { label: "Sending", tone: "amber" },
  sent: { label: "Sent", tone: "emerald" },
  delivered: { label: "Delivered", tone: "emerald" },
  read: { label: "Read", tone: "emerald" },
  failed: { label: "Failed", tone: "red" },
};

/** Whether a send got no answer from Meta, so it might or might not have arrived */
export function isUnknownOutcome(log: Pick<SendLog, "status" | "errorMessage">): boolean {
  return log.status === "queued" && Boolean(log.errorMessage?.startsWith(UNKNOWN_OUTCOME));
}

export function SendStatusBadge({ log }: { log: Pick<SendLog, "status" | "attempts" | "errorMessage"> }) {
  if (isUnknownOutcome(log)) return <Badge tone="amber">Unknown</Badge>;
  if (log.status === "failed") return <Badge tone="red">{`Failed (${log.attempts}/${MAX_ATTEMPTS})`}</Badge>;
  const { label, tone } = STATUSES[log.status];
  return <Badge tone={tone}>{label}</Badge>;
}
