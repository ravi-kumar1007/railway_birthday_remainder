import { describe, expect, it } from "vitest";
import { mapMetaStatus, planTemplateSync, readMetaTemplate, type MetaTemplate, type SavedTemplate } from "@/lib/template-sync";

function meta(overrides: Partial<MetaTemplate> = {}): MetaTemplate {
  return {
    id: "m1",
    name: "birthday_wish",
    language: "en",
    status: "APPROVED",
    category: "MARKETING",
    rejected_reason: "NONE",
    parameter_format: "POSITIONAL",
    components: [{ type: "BODY", text: "Happy birthday, {{1}}!", example: { body_text: [["Priya"]] } }],
    ...overrides,
  };
}

function saved(overrides: Partial<SavedTemplate> = {}): SavedTemplate {
  return {
    id: "t1",
    name: "birthday_wish",
    language: "en",
    metaTemplateId: "m1",
    status: "PENDING",
    rejectionReason: null,
    category: "MARKETING",
    bodyText: "Happy birthday, {{1}}!",
    exampleValue: "Priya",
    ...overrides,
  };
}

describe("mapMetaStatus", () => {
  it("keeps the statuses the app stores and folds Meta's others into them", () => {
    expect(mapMetaStatus("APPROVED")).toEqual({ status: "APPROVED", note: null });
    expect(mapMetaStatus("IN_APPEAL")).toEqual({ status: "PENDING", note: expect.stringMatching(/appeal/i) });
    expect(mapMetaStatus("ARCHIVED").status).toBe("DISABLED");
    expect(mapMetaStatus("PENDING_DELETION").status).toBe("DISABLED");
    expect(mapMetaStatus("SOMETHING_NEW").status).toBe("PENDING");
  });
});

describe("readMetaTemplate", () => {
  it("reads the body, sample, status and rejection reason", () => {
    expect(readMetaTemplate(meta({ status: "REJECTED", rejected_reason: "INVALID_FORMAT" }))).toEqual({
      fields: {
        name: "birthday_wish",
        language: "en",
        bodyText: "Happy birthday, {{1}}!",
        exampleValue: "Priya",
        category: "MARKETING",
        metaTemplateId: "m1",
        status: "REJECTED",
        rejectionReason: "Invalid format",
      },
      problem: null,
    });
  });

  it("explains why a template can't be used for birthday wishes", () => {
    const body = (text: string) => ({ type: "BODY", text });
    expect(readMetaTemplate(meta({ components: [body("Hi {{1}}, your code is {{2}}.")] })).problem).toMatch(/2 variables/);
    expect(readMetaTemplate(meta({ components: [body("Happy birthday from all of us!")] })).problem).toMatch(/no \{\{1\}\}/);
    expect(
      readMetaTemplate(meta({ components: [{ type: "HEADER", format: "IMAGE" }, body("Happy birthday, {{1}}!")] })).problem,
    ).toMatch(/image/i);
    expect(
      readMetaTemplate(meta({ parameter_format: "NAMED", components: [body("Hi {{first_name}}, happy birthday!")] })).problem,
    ).toMatch(/named/i);
    expect(
      readMetaTemplate(
        meta({ components: [body("Hi {{1}}, happy birthday!"), { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x.com/{{1}}" }] }] }),
      ).problem,
    ).toMatch(/button/i);
  });

  it("accepts static headers, footers and quick replies", () => {
    expect(
      readMetaTemplate(
        meta({
          components: [
            { type: "HEADER", format: "TEXT", text: "Greetings" },
            { type: "BODY", text: "Happy birthday, {{1}}!" },
            { type: "FOOTER", text: "Acme" },
            { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Thank you!" }] },
          ],
        }),
      ).problem,
    ).toBeNull();
  });
});

describe("planTemplateSync", () => {
  it("updates statuses from Meta, matching saved templates by Meta id", () => {
    expect(planTemplateSync([saved()], [meta()], { importNew: false })).toEqual({
      updates: [{ id: "t1", set: expect.objectContaining({ status: "APPROVED", rejectionReason: null }) }],
      inserts: [],
      skipped: [],
    });
  });

  it("leaves templates that already match Meta alone", () => {
    expect(planTemplateSync([saved({ status: "APPROVED" })], [meta()], { importNew: false }).updates).toEqual([]);
  });

  it("links a draft to the Meta template with the same name and language", () => {
    expect(planTemplateSync([saved({ metaTemplateId: null, status: "DRAFT" })], [meta()], { importNew: false }).updates).toEqual([
      { id: "t1", set: expect.objectContaining({ metaTemplateId: "m1", status: "APPROVED" }) },
    ]);
  });

  it("keeps an unsubmitted draft as it is", () => {
    expect(planTemplateSync([saved({ metaTemplateId: null, status: "DRAFT" })], [], { importNew: false }).updates).toEqual([]);
  });

  it("disables a template that was deleted in WhatsApp Manager", () => {
    expect(planTemplateSync([saved()], [], { importNew: false }).updates).toEqual([
      { id: "t1", set: { status: "DISABLED", rejectionReason: expect.stringMatching(/deleted/i) } },
    ]);
  });

  it("imports usable templates that aren't saved yet and lists the rest as skipped", () => {
    const plan = planTemplateSync(
      [],
      [meta(), meta({ id: "m2", name: "otp_code", components: [{ type: "BODY", text: "Code {{1}} for {{2}}" }] })],
      { importNew: true },
    );
    expect(plan.inserts).toEqual([expect.objectContaining({ name: "birthday_wish", metaTemplateId: "m1", status: "APPROVED" })]);
    expect(plan.skipped).toEqual([{ name: "otp_code", language: "en", reason: expect.stringMatching(/2 variables/) }]);
  });

  it("doesn't import anything during a plain status refresh", () => {
    expect(planTemplateSync([], [meta()], { importNew: false }).inserts).toEqual([]);
  });
});
