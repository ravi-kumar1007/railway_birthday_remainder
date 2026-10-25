import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { dbEnv } from "@/lib/env";
import * as schema from "./schema";

let instance: NeonHttpDatabase<typeof schema> | undefined;

// Created lazily so `next build` works without DATABASE_URL.
// neon-http has no interactive transactions: use db.batch([...]) for atomic writes.
export function getDb(): NeonHttpDatabase<typeof schema> {
  instance ??= drizzle({ client: neon(dbEnv().DATABASE_URL), schema });
  return instance;
}

export { schema };
