/**
 * Client IP for rate limiting. Prefers headers the hosting edge sets itself
 * (Netlify, then Vercel / most proxies) over the client-controllable X-Forwarded-For chain.
 */
export function getClientIp(headers: Headers): string {
  const direct = headers.get("x-nf-client-connection-ip") ?? headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** Only same-site admin paths are allowed as a post-login redirect target. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin")) return "/admin";
  if (next.startsWith("//") || next.includes("\\")) return "/admin";
  const rest = next.slice("/admin".length);
  if (rest !== "" && !/^[/?#]/.test(rest)) return "/admin";
  return next;
}
