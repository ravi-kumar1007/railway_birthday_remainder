import "server-only";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getLockout, LOCKOUT_MS, MAX_FAILED_ATTEMPTS, type Lockout } from "./lockout";

const { loginAttempts } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Locks need 30 minutes of history; anything older than a day is clutter */
async function pruneOldAttempts(): Promise<void> {
  await getDb()
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, new Date(Date.now() - DAY_MS)));
}

/** The lockout for an IP, ignoring one attempt (the caller's own, already recorded) */
export async function checkLockout(ip: string, excludingAttemptId?: string): Promise<Lockout> {
  // Five failures within 15 minutes, ending less than 15 minutes ago, all fall inside 30 minutes
  const since = new Date(Date.now() - 2 * LOCKOUT_MS);
  const recent = await getDb()
    .select({ attemptedAt: loginAttempts.attemptedAt, success: loginAttempts.success })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        gt(loginAttempts.attemptedAt, since),
        excludingAttemptId ? ne(loginAttempts.id, excludingAttemptId) : undefined,
      ),
    )
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(MAX_FAILED_ATTEMPTS);
  return getLockout(recent);
}

/**
 * Records an attempt as failed before the password is checked, so guesses sent in parallel see each
 * other: at most five get past checkLockout, however many arrive at once.
 */
export async function startLoginAttempt(ip: string): Promise<string> {
  const [attempt] = await getDb()
    .insert(loginAttempts)
    .values({ ip, success: false, attemptedAt: new Date() })
    .returning({ id: loginAttempts.id });
  // Failed attempts never trigger the cleanup below, so tidy up now and then
  if (Math.random() < 0.05) await pruneOldAttempts();
  return attempt.id;
}

/** An attempt refused by the lockout doesn't count again, or the lock would never end */
export async function discardLoginAttempt(attemptId: string): Promise<void> {
  await getDb().delete(loginAttempts).where(eq(loginAttempts.id, attemptId));
}

export async function markLoginSucceeded(attemptId: string): Promise<void> {
  await getDb().update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
  await pruneOldAttempts();
}
