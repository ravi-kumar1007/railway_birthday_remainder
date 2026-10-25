import { base64url, jwtVerify, SignJWT } from "jose";

// Kept free of Next.js imports so both proxy.ts and tests can use it.

export const SESSION_COOKIE = "bw_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const ISSUER = "birthday-wishes";
const AUDIENCE = "birthday-wishes-admin";

export type SessionPayload = { email: string };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

/**
 * Ties a session to the current password: changing ADMIN_PASSWORD_HASH signs every session out,
 * including a stolen one. An HMAC, so the token reveals nothing about the hash.
 */
async function passwordFingerprint(secret: string, passwordHash: string): Promise<string> {
  const hmacKey = await crypto.subtle.importKey("raw", key(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`password:${passwordHash}`));
  return base64url.encode(new Uint8Array(mac)).slice(0, 22);
}

export async function signSessionToken(email: string, secret: string, passwordHash: string): Promise<string> {
  return new SignJWT({ role: "admin", pwd: await passwordFingerprint(secret, passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the session, or null for a missing, tampered, expired or foreign token, or one from an old password. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  passwordHash: string | undefined,
): Promise<SessionPayload | null> {
  if (!token || !secret || !passwordHash) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.role !== "admin" || typeof payload.sub !== "string") return null;
    if (payload.pwd !== (await passwordFingerprint(secret, passwordHash))) return null;
    return { email: payload.sub };
  } catch {
    return null;
  }
}
