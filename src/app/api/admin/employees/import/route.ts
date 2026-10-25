import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowNextErrors, uniqueViolation } from "@/db/errors";
import { getSession } from "@/lib/auth/session";
import { importRowSchema, type ImportRow } from "@/lib/employee-schema";
import { applyImportPlan, findEmployeesByPhoneOrCode } from "@/lib/employees";
import { IMPORT_CHUNK_SIZE, planImport, type ImportChunkResult } from "@/lib/import/plan";
import { describeError } from "@/lib/log";

const requestSchema = z.object({
  mode: z.enum(["upsert", "insert"]),
  rows: z.array(z.unknown()).min(1).max(IMPORT_CHUNK_SIZE),
});

// A full chunk of real rows is well under this
const MAX_BODY_CHARS = 1_000_000;

function reply(body: ImportChunkResult, status = 200) {
  return Response.json(body, { status });
}

/**
 * Saves one chunk of rows from the import page, all or nothing. The browser already checked
 * every row; they are validated again here because anyone could call this route.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return reply({ error: "Your session has expired. Sign in again, then retry." }, 401);
  // JSON only: an HTML form on another site can't send it, on top of the SameSite cookie
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ error: "Send the rows as JSON." }, 415);
  }

  if (Number(request.headers.get("content-length")) > MAX_BODY_CHARS) {
    return reply({ error: "Too much data in one request." }, 413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return reply({ error: "Too much data in one request." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: "The request was not valid JSON." }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return reply({ error: `Send between 1 and ${IMPORT_CHUNK_SIZE} rows with a mode of upsert or insert.` }, 400);
  }

  const valid: { index: number; data: ImportRow }[] = [];
  const invalid: { index: number; reason: string }[] = [];
  parsed.data.rows.forEach((row, index) => {
    const result = importRowSchema.safeParse(row);
    if (result.success) valid.push({ index, data: result.data });
    else invalid.push({ index, reason: result.error.issues[0]?.message ?? "Invalid row." });
  });

  try {
    const saved = await findEmployeesByPhoneOrCode(
      valid.map((row) => row.data.phone),
      valid.flatMap((row) => (row.data.empCode === null ? [] : [row.data.empCode])),
    );
    const plan = planImport(valid, saved, parsed.data.mode);
    await applyImportPlan(plan);
    revalidatePath("/admin", "layout");

    return reply({
      inserted: plan.inserts.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
      skipped: [...invalid, ...plan.skipped].sort((a, b) => a.index - b.index),
    });
  } catch (error) {
    rethrowNextErrors(error);
    if (uniqueViolation(error)) {
      return reply(
        { error: "Some employees changed while this batch was saving, so none of it was saved. Run the import again." },
        409,
      );
    }
    console.error("Employee import failed:", describeError(error));
    return reply({ error: "Could not save this batch. Check the database connection and try again." }, 500);
  }
}
