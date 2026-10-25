import { unstable_rethrow } from "next/navigation";

/**
 * The constraint a failed query violated, if it was a unique violation (Postgres 23505).
 * Drizzle wraps the driver's error, so both the error and its cause are checked.
 */
export function uniqueViolation(error: unknown): string | null {
  const candidates = [error, error instanceof Error ? error.cause : undefined];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const { code, constraint } = candidate as { code?: unknown; constraint?: unknown };
    if (code === "23505" && typeof constraint === "string") return constraint;
  }
  return null;
}

/**
 * Call first in a `catch` around a query that runs while rendering. Next.js aborts in-flight fetches
 * when it abandons a prerender and expects that rejection to reach React, not an error message.
 * Drizzle wraps it in `cause` and Neon in `sourceError`, which unstable_rethrow alone doesn't follow.
 */
export function rethrowNextErrors(error: unknown): void {
  let current = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    unstable_rethrow(current);
    current = current.cause ?? (current as { sourceError?: unknown }).sourceError;
  }
}
