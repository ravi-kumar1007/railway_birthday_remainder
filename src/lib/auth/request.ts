import { isIPv4, isIPv6 } from "node:net";

/**
 * Client IP for the sign-in lockout, from the header the host sets itself and a visitor can't forge:
 * x-real-ip on Vercel, Netlify's x-nf-client-connection-ip elsewhere. On other hosts it falls back to
 * the first X-Forwarded-For entry, which a client can forge, so the lockout is weaker there.
 */
export function getClientIp(headers: Headers, onVercel = process.env.VERCEL === "1"): string {
  const trusted = headers.get(onVercel ? "x-real-ip" : "x-nf-client-connection-ip")?.trim();
  const ip = trusted || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return lockoutKey(ip);
}

/**
 * IPv6 addresses are grouped by their /64 network, the block one subscriber usually controls, so
 * rotating addresses inside it doesn't get around the lockout. IPv4-mapped IPv6 becomes plain IPv4.
 */
export function lockoutKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (!isIPv6(ip)) return ip;

  const [head, tail] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

/** Only same-site admin paths are allowed as a post-login redirect target. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin")) return "/admin";
  if (next.startsWith("//") || next.includes("\\")) return "/admin";
  const rest = next.slice("/admin".length);
  if (rest !== "" && !/^[/?#]/.test(rest)) return "/admin";
  return next;
}
