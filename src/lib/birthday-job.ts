import "server-only";
import { birthdayStore } from "./birthday-store";
import { runBirthdays, type RunSummary } from "./birthday-run";
import { metaConfigProblem } from "./env";
import { sendTemplateMessage } from "./meta/messages-api";

/** One run of the daily job against the real database and Meta. Safe to call any number of times. */
export async function runBirthdayJob(): Promise<RunSummary> {
  const summary = await runBirthdays({
    store: birthdayStore,
    send: sendTemplateMessage,
    unavailable: metaConfigProblem(),
  });
  // Counts and a note only: no names or phone numbers in the logs
  console.info("Birthday run:", JSON.stringify(summary));
  return summary;
}
