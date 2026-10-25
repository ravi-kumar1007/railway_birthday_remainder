import { z } from "zod";

/** Birthday wishes are marketing messages in Meta's terms */
export const TEMPLATE_CATEGORY = "MARKETING";

/** The only variable: the employee's name */
export const NAME_VARIABLE = "{{1}}";

export const MAX_BODY_LENGTH = 1024;

export const TEMPLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ur", label: "Urdu" },
] as const;

export function languageLabel(code: string): string {
  return TEMPLATE_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/** "Birthday Wish-2026" -> "birthday_wish_2026", Meta's naming format */
export function normalizeTemplateName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Every {{...}} in the text, with its contents as written */
export function templateVariables(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1]);
}

/** Why Meta would reject this body, or why it can't carry just the employee's name. Null when fine. */
export function templateBodyProblem(body: string): string | null {
  const text = body.trim();
  if (!text) return "Write the message.";
  if (text.length > MAX_BODY_LENGTH) return `Keep the message under ${MAX_BODY_LENGTH} characters.`;

  const variables = templateVariables(text);
  if (variables.some((variable) => variable.trim() !== "1")) {
    return "Only {{1}}, the employee's name, is supported. Remove any other variables.";
  }
  if (variables.some((variable) => variable !== "1")) return "Write the name variable as {{1}}, without spaces.";
  if (/\{\{|\}\}|\{\d|\d\}/.test(text.replaceAll(NAME_VARIABLE, ""))) {
    return "Check the curly braces: the name variable is written {{1}}.";
  }
  if (variables.length === 0) return "Add {{1}} where the employee's name should go.";
  if (variables.length > 1) return "Use {{1}} only once.";
  if (text.startsWith(NAME_VARIABLE) || text.endsWith(NAME_VARIABLE)) {
    return "Meta rejects messages that start or end with {{1}}. Add words or punctuation before and after it.";
  }
  return null;
}

export const templateInputSchema = z.object({
  name: z
    .string()
    .transform(normalizeTemplateName)
    .pipe(
      z
        .string()
        .min(1, "Give the template a name.")
        .max(512, "Keep the name under 512 characters.")
        .regex(/^[a-z0-9_]+$/, "Use only letters, numbers and underscores."),
    ),
  language: z
    .string()
    .refine((code) => TEMPLATE_LANGUAGES.some((language) => language.code === code), "Choose a language."),
  bodyText: z
    .string()
    .trim()
    .superRefine((body, ctx) => {
      const problem = templateBodyProblem(body);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  exampleValue: z
    .string()
    .trim()
    .min(1, "Give a sample name; Meta's reviewers see it in place of {{1}}.")
    .max(60, "Keep the sample name under 60 characters."),
});

export type TemplateInput = z.output<typeof templateInputSchema>;

/** The body of POST /{WABA_ID}/message_templates */
export function toMetaTemplatePayload(input: TemplateInput) {
  return {
    name: input.name,
    language: input.language,
    category: TEMPLATE_CATEGORY,
    parameter_format: "POSITIONAL",
    components: [{ type: "BODY", text: input.bodyText, example: { body_text: [[input.exampleValue]] } }],
  };
}

/** The message as the employee sees it */
export function renderTemplate(body: string, name: string): string {
  return body.replaceAll(NAME_VARIABLE, name);
}
