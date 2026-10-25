import "server-only";
import { birthdayStore } from "./birthday-store";
import { retryWish, runBirthdays, type RunSource, type RunSummary } from "./birthday-run";
import { metaConfigProblem } from "./env";
import { describeError } from "./log";
import { sendTemplateMessage } from "./meta/messages-api";

/** One run of the daily job against the real database and Meta. Safe to call any number of times. */
export async function runBirthdayJob(source: RunSource): Promise<RunSummary> {
  const summary = await runBirthdays({
    store: birthdayStore,
    send: sendTemplateMessage,
    unavailable: metaConfigProblem(),
    source,
    onError: (error) => console.error("Birthday worker stopped:", describeError(error)),
  });
  // Counts and a note only: no names or phone numbers in the logs
  console.info("Birthday run:", JSON.stringify(summary));
  return summary;
}

/** An admin's Retry on one send from the logs page */
export async function retryBirthdayWish(logId: string) {
  return retryWish({ store: birthdayStore, send: sendTemplateMessage, logId, unavailable: metaConfigProblem() });
}
