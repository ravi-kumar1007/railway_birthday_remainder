import { jwtVerify, SignJWT } from "jose";

// Kept free of Next.js imports so both proxy.ts and tests can use it.

export const SESSION_COOKIE = "bw_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const ISSUER = "birthday-wishes";
const AUDIENCE = "birthday-wishes-admin";

export type SessionPayload = { email: string };

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(email: string, secret: string): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the session, or null for a missing, tampered, expired or foreign token. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.role !== "admin" || typeof payload.sub !== "string") return null;
    return { email: payload.sub };
  } catch {
    return null;
  }
}
