import { describe, expect, it } from "vitest";
import {
  normalizeTemplateName,
  renderTemplate,
  templateBodyProblem,
  templateInputSchema,
  toMetaTemplatePayload,
} from "@/lib/templates";

describe("normalizeTemplateName", () => {
  it("turns a typed name into Meta's lowercase_with_underscores format", () => {
    expect(normalizeTemplateName("  Birthday Wish-2026 ")).toBe("birthday_wish_2026");
  });
});

describe("templateBodyProblem", () => {
  it("accepts a message with {{1}} inside the text", () => {
    expect(templateBodyProblem("Happy birthday, {{1}}! Have a great year.")).toBeNull();
    expect(templateBodyProblem("Dear {{1}},\nhappy birthday!")).toBeNull();
  });

  it("needs exactly one {{1}} for the name", () => {
    expect(templateBodyProblem("Happy birthday!")).toMatch(/Add \{\{1\}\}/);
    expect(templateBodyProblem("Hi {{1}}, happy birthday {{1}}!")).toMatch(/only once/);
  });

  it("rejects other or malformed variables", () => {
    expect(templateBodyProblem("Hi {{1}}, love from the {{2}} team!")).toMatch(/Only \{\{1\}\}/);
    expect(templateBodyProblem("Hi {{name}}, happy birthday!")).toMatch(/Only \{\{1\}\}/);
    expect(templateBodyProblem("Hi {{ 1 }}, happy birthday!")).toMatch(/without spaces/);
    expect(templateBodyProblem("Hi {{1}, happy birthday!")).toMatch(/curly braces/);
  });

  it("rejects {{1}} at the very start or end, as Meta does", () => {
    expect(templateBodyProblem("{{1}}, happy birthday!")).toMatch(/start or end/);
    expect(templateBodyProblem("Happy birthday {{1}}")).toMatch(/start or end/);
  });

  it("needs some text, but not too much", () => {
    expect(templateBodyProblem("   ")).toMatch(/Write/);
    expect(templateBodyProblem(`Hi {{1}}! ${"x".repeat(1100)}`)).toMatch(/1024/);
  });
});

describe("templateInputSchema", () => {
  it("normalizes a new template", () => {
    expect(
      templateInputSchema.parse({
        name: "Birthday Wish",
        language: "en",
        bodyText: "  Happy birthday, {{1}}!  ",
        exampleValue: " Priya ",
      }),
    ).toEqual({ name: "birthday_wish", language: "en", bodyText: "Happy birthday, {{1}}!", exampleValue: "Priya" });
  });

  it("rejects bad names, unknown languages and a missing sample", () => {
    const result = templateInputSchema.safeParse({
      name: "wish!",
      language: "xx",
      bodyText: "Happy birthday, {{1}}!",
      exampleValue: "",
    });
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toEqual([
      "name",
      "language",
      "exampleValue",
    ]);
  });
});

describe("toMetaTemplatePayload", () => {
  it("builds a MARKETING template with the sample name for review", () => {
    expect(
      toMetaTemplatePayload({ name: "birthday_wish", language: "en", bodyText: "Happy birthday, {{1}}!", exampleValue: "Priya" }),
    ).toEqual({
      name: "birthday_wish",
      language: "en",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      components: [{ type: "BODY", text: "Happy birthday, {{1}}!", example: { body_text: [["Priya"]] } }],
    });
  });
});

describe("renderTemplate", () => {
  it("puts the name where {{1}} is", () => {
    expect(renderTemplate("Happy birthday, {{1}}! 🎉", "Priya")).toBe("Happy birthday, Priya! 🎉");
  });
});
