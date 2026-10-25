import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isUuid } from "./ids";
import type { TemplateSyncPlan } from "./template-sync";

const { templates } = schema;

export async function listTemplates() {
  return getDb()
    .select()
    .from(templates)
    .orderBy(desc(templates.isActive), asc(templates.name), asc(templates.language));
}

export async function getTemplate(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await getDb().select().from(templates).where(eq(templates.id, id)).limit(1);
  return row ?? null;
}

/** Saves a sync plan all-or-nothing (neon-http runs a batch as one transaction) */
export async function applyTemplateSync(plan: TemplateSyncPlan): Promise<void> {
  const db = getDb();
  const statements = [
    ...plan.updates.map(({ id, set }) => db.update(templates).set(set).where(eq(templates.id, id))),
    // A clash means it's already saved under another id; leave that row as it is
    ...(plan.inserts.length > 0 ? [db.insert(templates).values(plan.inserts).onConflictDoNothing()] : []),
  ];
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}

/** Makes this the only active template: switching the old one off first keeps the single-active index happy */
export async function setActiveTemplate(id: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(templates).set({ isActive: false }).where(eq(templates.isActive, true)),
    db.update(templates).set({ isActive: true }).where(eq(templates.id, id)),
  ]);
}
