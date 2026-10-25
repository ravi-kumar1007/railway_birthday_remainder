import { z } from "zod";

/** Row ids are UUIDs; checking first turns a bad id into "not found" rather than a database error */
export function isUuid(id: unknown): id is string {
  return z.uuid().safeParse(id).success;
}
