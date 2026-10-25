import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isStatusUpgrade, parseWebhook, verifyWebhookSignature } from "@/lib/webhook";

const SECRET = "app-secret-for-tests";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function statusPayload(...statuses: object[]) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses } }] }],
  };
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify(statusPayload({ id: "wamid.1", status: "sent" }));

  it("accepts Meta's HMAC-SHA256 of the raw body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, and missing or malformed headers", () => {
    expect(verifyWebhookSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sign(body), SECRET)).toBe(false);
    for (const header of [null, "", "sha256=", sign(body).replace("sha256=", "sha1="), "sha256=zz"]) {
      expect(verifyWebhookSignature(body, header, SECRET), String(header)).toBe(false);
    }
  });
});

describe("parseWebhook", () => {
  it("reads message statuses, with Meta's error for failures", () => {
    const payload = statusPayload(
      { id: "wamid.1", status: "delivered", timestamp: "1700000000", recipient_id: "919876543210" },
      {
        id: "wamid.2",
        status: "failed",
        errors: [
          {
            code: 131049,
            title: "This message was not delivered to maintain healthy ecosystem engagement.",
            message: "This message was not delivered to maintain healthy ecosystem engagement.",
            error_data: { details: "In order to maintain a healthy ecosystem engagement, the message failed to be delivered." },
          },
        ],
      },
    );
    expect(parseWebhook(payload).statuses).toEqual([
      { waMessageId: "wamid.1", status: "delivered", errorCode: null, errorMessage: null },
      {
        waMessageId: "wamid.2",
        status: "failed",
        errorCode: "131049",
        errorMessage:
          "This message was not delivered to maintain healthy ecosystem engagement. In order to maintain a healthy ecosystem engagement, the message failed to be delivered.",
      },
    ]);
  });

  it("ignores voice-message plays, unknown statuses and malformed data", () => {
    expect(parseWebhook(statusPayload({ id: "wamid.1", status: "played" }, { id: "wamid.2", status: "weird" }, { status: "sent" })).statuses).toEqual([]);
    for (const junk of [null, "text", 42, {}, { entry: "x" }, { entry: [{ changes: [{ value: { statuses: "x" } }] }] }]) {
      expect(parseWebhook(junk)).toEqual({ statuses: [], templates: [] });
    }
  });

  it("reads template status events", () => {
    const change = (value: object) => ({ entry: [{ changes: [{ field: "message_template_status_update", value }] }] });
    expect(parseWebhook(change({ event: "APPROVED", message_template_id: 1689556908129832, reason: "NONE" })).templates).toEqual([
      { metaTemplateId: "1689556908129832", status: "APPROVED", note: null },
    ]);
    expect(parseWebhook(change({ event: "REJECTED", message_template_id: 5, reason: "INVALID_FORMAT" })).templates).toEqual([
      { metaTemplateId: "5", status: "REJECTED", note: "Invalid format" },
    ]);
    expect(parseWebhook(change({ event: "REINSTATED", message_template_id: 6 })).templates).toEqual([
      { metaTemplateId: "6", status: "APPROVED", note: null },
    ]);
    // These don't say what the status is now; the templates page refresh picks it up
    expect(parseWebhook(change({ event: "UNARCHIVED", message_template_id: 7 })).templates).toEqual([]);
  });
});

describe("isStatusUpgrade", () => {
  it("moves forward through sent, delivered and read, never back", () => {
    expect(isStatusUpgrade("queued", "sent")).toBe(true);
    expect(isStatusUpgrade("sent", "delivered")).toBe(true);
    expect(isStatusUpgrade("delivered", "read")).toBe(true);
    expect(isStatusUpgrade("sent", "read")).toBe(true);
    expect(isStatusUpgrade("read", "delivered")).toBe(false);
    expect(isStatusUpgrade("delivered", "sent")).toBe(false);
  });

  it("lets a failure replace sent, and proof of delivery replace a failure", () => {
    expect(isStatusUpgrade("sent", "failed")).toBe(true);
    expect(isStatusUpgrade("failed", "delivered")).toBe(true);
    expect(isStatusUpgrade("failed", "sent")).toBe(false);
    expect(isStatusUpgrade("read", "failed")).toBe(false);
  });
});
