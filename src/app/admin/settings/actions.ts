"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { describeError } from "@/lib/log";
import { parseNameFormat } from "@/lib/names";
import { setNameFormat } from "@/lib/settings-store";

export type NameFormatState = { saved?: boolean; error?: string };

export async function saveNameFormat(_prev: NameFormatState, formData: FormData): Promise<NameFormatState> {
  await requireAdmin();
  const value = formData.get("nameFormat");
  try {
    await setNameFormat(parseNameFormat(typeof value === "string" ? value : null));
  } catch (error) {
    console.error("Saving the name format failed:", describeError(error));
    return { error: "Could not save. Check the database connection and try again." };
  }
  revalidatePath("/admin", "layout");
  return { saved: true };
}
