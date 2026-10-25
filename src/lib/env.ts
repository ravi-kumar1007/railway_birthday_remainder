import "server-only";
import { z } from "zod";

// Each feature validates only the variables it needs, so login works before Meta is configured.
// Error messages name the missing variables, never their values.

function parseEnv<T extends z.ZodRawShape>(shape: T, group: string): z.infer<z.ZodObject<T>> {
  const result = z.object(shape).safeParse(process.env);
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
    .string()
    .regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, "must be a bcrypt hash (run npm run hash-password)"),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
};

let dbCache: z.infer<z.ZodObject<typeof dbShape>> | undefined;
let authCache: z.infer<z.ZodObject<typeof authShape>> | undefined;

export function dbEnv() {
  dbCache ??= parseEnv(dbShape, "database");
  return dbCache;
}

export function authEnv() {
  authCache ??= parseEnv(authShape, "auth");
  return authCache;
}
