"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { retryBirthdayWish } from "@/lib/birthday-job";
import { isUuid } from "@/lib/ids";
import { describeError } from "@/lib/log";

export type RetryResult = { ok: true } | { ok: false; error: string };

export async function retrySend(logId: string): Promise<RetryResult> {
  await requireAdmin();
  if (!isUuid(logId)) return { ok: false, error: "This send no longer exists." };
  try {
    const result = await retryBirthdayWish(logId);
    revalidatePath("/admin", "layout");
    return result;
  } catch (error) {
    console.error("Retrying a send failed:", describeError(error));
    return { ok: false, error: "Could not retry. Check the database connection and try again." };
  }
}
