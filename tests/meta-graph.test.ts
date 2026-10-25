import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { graphRequest, MetaApiError } from "@/lib/meta/graph";
import { deleteMetaTemplate, listMetaTemplates } from "@/lib/meta/templates-api";

const TOKEN = "EAAtest-token-that-must-never-appear-in-urls-or-messages";

Object.assign(process.env, {
  META_GRAPH_VERSION: "v26.0",
  META_ACCESS_TOKEN: TOKEN,
  META_WABA_ID: "1111",
  META_PHONE_NUMBER_ID: "2222",
});

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const call = (n: number) => {
  const [url, init] = fetchMock.mock.calls[n];
  return { url: new URL(String(url)), init: init ?? {} };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("graphRequest", () => {
  it("calls the configured Graph version, with the token only in the Authorization header", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "1" }));
    await graphRequest("1111/message_templates", { method: "POST", body: { name: "x" } });
    const { url, init } = call(0);
    expect(url.href).toBe("https://graph.facebook.com/v26.0/1111/message_templates");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init.body).toBe('{"name":"x"}');
  });

  it("uses Meta's user-facing error message when there is one", async () => {
    fetchMock.mockResolvedValue(
      reply(400, {
        error: {
          message: "(#100) Invalid parameter",
          code: 100,
          error_subcode: 2388024,
          error_user_msg: "There is already English (US) content for this template.",
          fbtrace_id: "trace",
        },
      }),
    );
    await expect(graphRequest("x")).rejects.toMatchObject({
      name: "MetaApiError",
      message: "There is already English (US) content for this template.",
      status: 400,
      code: 100,
    });
  });

  it("explains an expired or invalid token, and a missing permission", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: { message: "Error validating access token: Session has expired", code: 190 } }));
    await expect(graphRequest("x")).rejects.toThrow(/access token is invalid or has expired/);
    fetchMock.mockResolvedValueOnce(reply(403, { error: { message: "(#200) Permissions error", code: 200 } }));
    await expect(graphRequest("x")).rejects.toThrow(/whatsapp_business_management/);
  });

  it("reports network failures without the token", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const error = await graphRequest("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe("listMetaTemplates", () => {
  it("follows the paging cursor until the last page", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: [{ id: "1" }], paging: { cursors: { after: "c1" }, next: "https://graph.facebook.com/next" } }))
      .mockResolvedValueOnce(reply(200, { data: [{ id: "2" }], paging: { cursors: { after: "c2" } } }));
    expect((await listMetaTemplates()).map((template) => template.id)).toEqual(["1", "2"]);
    expect(call(0).url.pathname).toBe("/v26.0/1111/message_templates");
    expect(call(0).url.searchParams.get("fields")).toContain("rejected_reason");
    expect(call(1).url.searchParams.get("after")).toBe("c1");
  });
});

describe("deleteMetaTemplate", () => {
  it("deletes just this language version, by id and name", async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));
    await deleteMetaTemplate({ metaTemplateId: "m1", name: "birthday_wish" });
    const { url, init } = call(0);
    expect(init.method).toBe("DELETE");
    expect(Object.fromEntries(url.searchParams)).toEqual({ hsm_id: "m1", name: "birthday_wish" });
  });
});
