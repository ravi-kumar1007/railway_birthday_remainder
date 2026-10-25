import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { rethrowNextErrors } from "@/db/errors";
import { safeEqual } from "@/lib/cron-auth";
import { EnvError, webhookEnv } from "@/lib/env";
import { describeError } from "@/lib/log";
import { parseWebhook, verifyWebhookSignature } from "@/lib/webhook";
import { applyWebhookUpdates } from "@/lib/webhook-store";

const MAX_BODY_BYTES = 1_000_000;

function settings() {
  try {
    return webhookEnv();
  } catch (error) {
    if (!(error instanceof EnvError)) throw error;
    console.error(error.message);
    return null;
  }
}

/** Meta's one-time check when the callback URL is saved in the App Dashboard */
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const verifyToken = settings()?.META_WEBHOOK_VERIFY_TOKEN;

  if (params.get("hub.mode") === "subscribe" && challenge && token && verifyToken && safeEqual(token, verifyToken)) {
    return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Message delivery statuses and template review results */
export async function POST(request: Request) {
  await connection();
  const appSecret = settings()?.META_APP_SECRET;
  // Not set up yet: refuse, and Meta keeps the events and retries later
  if (!appSecret) return new Response("Webhook not configured", { status: 503 });

  // The signature covers the exact bytes Meta sent, so check them before parsing
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) return new Response("Too large", { status: 413 });
  if (!verifyWebhookSignature(body, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const updates = parseWebhook(payload);
  if (updates.statuses.length > 0 || updates.templates.length > 0) {
    try {
      await applyWebhookUpdates(updates);
    } catch (error) {
      rethrowNextErrors(error);
      console.error("Applying webhook updates failed:", describeError(error));
      // Anything but 200 makes Meta send the event again later
      return new Response("Try again later", { status: 500 });
    }
    revalidatePath("/admin", "layout");
  }
  // Counts only: payloads contain phone numbers
  console.info(`Webhook: ${updates.statuses.length} message statuses, ${updates.templates.length} template events`);
  return new Response("OK");
}
