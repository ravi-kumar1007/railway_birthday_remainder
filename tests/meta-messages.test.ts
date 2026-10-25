import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTemplateMessage } from "@/lib/meta/messages-api";

Object.assign(process.env, {
  META_GRAPH_VERSION: "v26.0",
  META_ACCESS_TOKEN: "EAAtest-token-that-must-never-appear-in-urls-or-messages",
  META_WABA_ID: "1111",
  META_PHONE_NUMBER_ID: "2222",
});

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const message = { to: "+919876543210", templateName: "birthday_wish", language: "en", name: "Priya" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("sendTemplateMessage", () => {
  it("posts the template with the name as the only body parameter", async () => {
    fetchMock.mockResolvedValue(reply(200, { messages: [{ id: "wamid.ABC" }] }));
    expect(await sendTemplateMessage(message, 5000)).toEqual({ ok: true, waMessageId: "wamid.ABC" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/2222/messages");
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: "birthday_wish",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }] }],
      },
    });
  });

  it("reports Meta's refusal as a definite failure that can be retried", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: { code: 131026, message: "Message undeliverable" } }));
    expect(await sendTemplateMessage(message, 5000)).toEqual({
      ok: false,
      definite: true,
      code: "131026",
      message: "Message undeliverable",
    });
  });

  it("treats a request that never reached Meta as definitely not sent", async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    expect(await sendTemplateMessage(message, 5000)).toMatchObject({ ok: false, definite: true });
  });

  it("treats a timeout or dropped connection as an unknown outcome, never to be retried automatically", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    expect(await sendTemplateMessage(message, 5000)).toMatchObject({ ok: false, definite: false });
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }));
    expect(await sendTemplateMessage(message, 5000)).toMatchObject({ ok: false, definite: false });
  });

  it("treats a success without a message id as unknown", async () => {
    fetchMock.mockResolvedValue(reply(200, { messages: [] }));
    expect(await sendTemplateMessage(message, 5000)).toMatchObject({ ok: false, definite: false });
  });
});
