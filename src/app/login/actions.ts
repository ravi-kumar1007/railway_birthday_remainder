"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  checkLockout,
  discardLoginAttempt,
  markLoginSucceeded,
  startLoginAttempt,
} from "@/lib/auth/login-attempts";
import { lockoutMessage } from "@/lib/auth/lockout";
import { getClientIp, safeNextPath } from "@/lib/auth/request";
import { createSession, deleteSession } from "@/lib/auth/session";
import { authEnv, EnvError } from "@/lib/env";
import { describeError } from "@/lib/log";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  // bcrypt only looks at the first 72 bytes
  password: z.string().min(1).max(200),
  next: z.string().max(2000).optional(),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, next } = parsed.data;

  try {
    const env = authEnv();
    const ip = getClientIp(await headers());

    // Recorded as a failure before checking, so guesses sent in parallel count against each other
    const attemptId = await startLoginAttempt(ip);
    const lock = await checkLockout(ip, attemptId);
    if (lock.locked) {
      await discardLoginAttempt(attemptId);
      return { error: lockoutMessage(lock.until), email };
    }

    // Always run bcrypt so a wrong email takes as long as a wrong password
    const passwordOk = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
    const ok = passwordOk && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

    if (ok) {
      await markLoginSucceeded(attemptId);
    } else {
      const after = await checkLockout(ip);
      return {
        error: after.locked ? lockoutMessage(after.until) : "Invalid email or password.",
        email,
      };
    }

    await createSession(env.ADMIN_EMAIL);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      return {
        error:
          process.env.NODE_ENV === "production"
            ? "Sign-in is not configured on the server."
            : error.message,
        email,
      };
    }
    console.error("Login failed:", describeError(error));
    return { error: "Could not sign in right now. Check the database connection.", email };
  }

  redirect(safeNextPath(next));
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
