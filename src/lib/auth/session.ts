import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authEnv } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./jwt";

export async function createSession(email: string): Promise<void> {
  const env = authEnv();
  const token = await signSessionToken(email, env.SESSION_SECRET, env.ADMIN_PASSWORD_HASH);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Browsers reject Secure cookies on plain http, which `next dev` uses
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The current admin session, or null. Also rejects tokens issued for a previous ADMIN_EMAIL. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  // Read the request first: during prerendering this is where rendering stops,
  // so env validation never runs at build time
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const env = authEnv();
  const session = await verifySessionToken(token, env.SESSION_SECRET, env.ADMIN_PASSWORD_HASH);
  if (!session || session.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;
  return session;
});

/** For pages and Server Actions: redirects to /login when not signed in. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
