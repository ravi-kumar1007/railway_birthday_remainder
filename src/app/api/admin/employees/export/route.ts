import { rethrowNextErrors } from "@/db/errors";
import { getSession } from "@/lib/auth/session";
import { todayInTimeZone, toIsoDate } from "@/lib/dates";
import { employeesToCsv } from "@/lib/employee-csv";
import { listAllEmployees } from "@/lib/employees";
import { describeError } from "@/lib/log";

/** Every employee, active or not, as a CSV backup the importer can read back */
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let csv: string;
  try {
    csv = employeesToCsv(await listAllEmployees());
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Employee export failed:", describeError(error));
    return Response.json({ error: "Could not export employees." }, { status: 500 });
  }

  // The byte order mark makes Excel read non-English names as UTF-8
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${toIsoDate(todayInTimeZone())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
