import "server-only";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getLockout, LOCKOUT_MS, MAX_FAILED_ATTEMPTS, type Lockout } from "./lockout";

const { loginAttempts } = schema;

export async function checkLockout(ip: string): Promise<Lockout> {
  // Five failures within 15 minutes, ending less than 15 minutes ago, all fall inside 30 minutes
  const since = new Date(Date.now() - 2 * LOCKOUT_MS);
  const recent = await getDb()
    .select({ attemptedAt: loginAttempts.attemptedAt, success: loginAttempts.success })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.attemptedAt, since)))
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(MAX_FAILED_ATTEMPTS);
  return getLockout(recent);
}

export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  const db = getDb();
  await db.insert(loginAttempts).values({ ip, success, attemptedAt: new Date() });
  if (success) {
    // Housekeeping: nothing older than a week is needed for lockouts
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, weekAgo));
  }
}
