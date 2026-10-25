import "server-only";
import { z } from "zod";

// Each feature validates only the variables it needs, so login works before Meta is configured.
// Error messages name the missing variables, never their values.

function parseEnv<T extends z.ZodRawShape>(shape: T, group: string): z.infer<z.ZodObject<T>> {
  // A blank line like "META_ACCESS_TOKEN=" in .env.local means not set
  const values = Object.fromEntries(Object.keys(shape).map((key) => [key, process.env[key] || undefined]));
  const result = z.object(shape).safeParse(values);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new EnvError(`Invalid ${group} environment variables: ${problems}`);
  }
  return result.data;
}

export class EnvError extends Error {
  name = "EnvError";
}

const dbShape = {
  DATABASE_URL: z.url("must be a Postgres connection string"),
};

const authShape = {
  ADMIN_EMAIL: z.email("must be an email address"),
  ADMIN_PASSWORD_HASH: z
    .string("is not set (run npm run hash-password)")
    .regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, "must be a bcrypt hash (run npm run hash-password)"),
  SESSION_SECRET: z.string("is not set").min(32, "must be at least 32 characters"),
};

const metaShape = {
  META_GRAPH_VERSION: z.string("is not set").regex(/^v\d+\.\d+$/, "must look like v26.0"),
  META_ACCESS_TOKEN: z.string("is not set").min(20, "must be a system user access token"),
  META_WABA_ID: z.string("is not set").regex(/^\d+$/, "must be the numeric WhatsApp Business Account ID"),
  META_PHONE_NUMBER_ID: z.string("is not set").regex(/^\d+$/, "must be the numeric phone number ID"),
};

let dbCache: z.infer<z.ZodObject<typeof dbShape>> | undefined;
let authCache: z.infer<z.ZodObject<typeof authShape>> | undefined;
let metaCache: z.infer<z.ZodObject<typeof metaShape>> | undefined;

const cronShape = {
  CRON_SECRET: z.string("is not set").min(16, "must be at least 16 random characters"),
};

let cronCache: z.infer<z.ZodObject<typeof cronShape>> | undefined;

export function cronEnv() {
  cronCache ??= parseEnv(cronShape, "cron");
  return cronCache;
}

export function dbEnv() {
  dbCache ??= parseEnv(dbShape, "database");
  return dbCache;
}

export function authEnv() {
  authCache ??= parseEnv(authShape, "auth");
  return authCache;
}

export function metaEnv() {
  metaCache ??= parseEnv(metaShape, "Meta WhatsApp");
  return metaCache;
}

/** Why the Meta settings can't be used, naming the variables but never their values; null when fine */
export function metaConfigProblem(): string | null {
  try {
    metaEnv();
    return null;
  } catch (error) {
    if (error instanceof EnvError) return error.message;
    throw error;
  }
}
