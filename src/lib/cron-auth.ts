import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time string comparison that also hides the length of the expected value */
export function safeEqual(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Checks "Authorization: Bearer <CRON_SECRET>". Comparing fixed-length hashes in constant time means
 * the response time reveals nothing about the secret, not even its length.
 */
export function isCronAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
}
