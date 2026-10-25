import { connection } from "next/server";
import { rethrowNextErrors } from "@/db/errors";
import { runBirthdayJob } from "@/lib/birthday-job";
import { isCronAuthorized } from "@/lib/cron-auth";
import { cronEnv, EnvError } from "@/lib/env";
import { describeError } from "@/lib/log";

/**
 * Called by cron-job.org at 12:00 IST with "Authorization: Bearer <CRON_SECRET>". It can be called
 * again (for retries, or to finish a run that hit its time budget) without anyone being wished twice.
 */
async function sendBirthdays(request: Request): Promise<Response> {
  await connection();

  let secret: string;
  try {
    secret = cronEnv().CRON_SECRET;
  } catch (error) {
    if (!(error instanceof EnvError)) throw error;
    console.error(error.message);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runBirthdayJob("cron"));
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Birthday run failed:", describeError(error));
    return Response.json({ error: "The birthday run failed. Check the server logs." }, { status: 500 });
  }
}

export const GET = sendBirthdays;
export const POST = sendBirthdays;
