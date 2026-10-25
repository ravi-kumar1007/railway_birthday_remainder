import "server-only";
import { getDb, schema } from "@/db";
import { birthdayStore } from "./birthday-store";
import type { NameFormat } from "./names";

const { settings } = schema;

export function getNameFormat(): Promise<NameFormat> {
  return birthdayStore.getNameFormat();
}

export async function setNameFormat(format: NameFormat): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key: "name_format", value: format })
    .onConflictDoUpdate({ target: settings.key, set: { value: format, updatedAt: new Date() } });
}
