import "server-only";
import { metaEnv } from "@/lib/env";

// Meta's Graph API over fetch: no SDK. The token goes in the Authorization header only, never in a
// URL, so it can't end up in logs or error messages.

/**
 * What happened to the request: Meta answered with an error (rejected), it never left this server
 * (not_sent), or there was no answer, so Meta may or may not have acted on it (unknown).
 */
export type MetaRequestOutcome = "rejected" | "not_sent" | "unknown";

export class MetaApiError extends Error {
  name = "MetaApiError";

  constructor(
    message: string,
    /** HTTP status, or 0 when there was no answer */
    readonly status: number,
    readonly outcome: MetaRequestOutcome,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
}

// Failures that happen before a connection exists, so the request can't have reached Meta
const NEVER_CONNECTED = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

function networkError(error: unknown): MetaApiError {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new MetaApiError("Meta didn't answer in time.", 0, "unknown");
  }
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  const neverConnected = typeof cause?.code === "string" && NEVER_CONNECTED.has(cause.code);
  return new MetaApiError("Couldn't reach Meta.", 0, neverConnected ? "not_sent" : "unknown");
}

type GraphErrorBody = {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };
};

function errorFrom(status: number, body: GraphErrorBody | null): MetaApiError {
  const error = body?.error;
  const code = error?.code;
  let message: string;
  if (code === 190) message = "The Meta access token is invalid or has expired. Create a new one and update META_ACCESS_TOKEN.";
  else if (code === 10 || code === 200) {
    message = "The Meta access token doesn't have permission. It needs whatsapp_business_management and whatsapp_business_messaging.";
  } else if (code === 4 || code === 80008 || code === 613) message = "Meta's rate limit was reached. Wait a few minutes and try again.";
  else message = error?.error_user_msg || error?.message || `Meta answered with status ${status}.`;
  return new MetaApiError(message, status, "rejected", code, error?.error_subcode);
}

type GraphRequest = {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

export async function graphRequest<T>(
  path: string,
  { method = "GET", query = {}, body, timeoutMs = 8000 }: GraphRequest = {},
): Promise<T> {
  const env = metaEnv();
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    throw networkError(error);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFrom(response.status, data as GraphErrorBody | null);
  return data as T;
}
