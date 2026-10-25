export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type AttemptRow = { attemptedAt: Date; success: boolean };
export type Lockout = { locked: false } | { locked: true; until: Date };

/**
 * `recent` is an IP's latest attempts, newest first (at least MAX_FAILED_ATTEMPTS rows if available).
 * The IP is locked for LOCKOUT_MS after its 5th failure, when those 5 failures happened within
 * LOCKOUT_MS of each other with no successful login in between.
 */
export function getLockout(recent: AttemptRow[], now: Date = new Date()): Lockout {
  const failures: Date[] = [];
  for (const row of recent) {
    if (row.success) break;
    failures.push(row.attemptedAt);
  }
  if (failures.length < MAX_FAILED_ATTEMPTS) return { locked: false };

  const newest = failures[0].getTime();
  const fifthNewest = failures[MAX_FAILED_ATTEMPTS - 1].getTime();
  if (newest - fifthNewest > LOCKOUT_MS) return { locked: false };

  const until = new Date(newest + LOCKOUT_MS);
  return until > now ? { locked: true, until } : { locked: false };
}

export function lockoutMessage(until: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
