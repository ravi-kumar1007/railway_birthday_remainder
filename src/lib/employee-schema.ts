import { z } from "zod";
import { isValidBirthday } from "./birthday";
import { todayInTimeZone } from "./dates";
import { normalizePhone } from "./phone";

export const MIN_BIRTH_YEAR = 1900;

/**
 * One employee as entered in the form or sent by the importer.
 * The server always re-validates with this, whatever the browser already checked.
 */
export const employeeInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name.")
      .max(100, "Keep the name under 100 characters.")
      .transform((name) => name.replace(/\s+/g, " ")),
    phone: z.string().transform((value, ctx) => {
      const result = normalizePhone(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.phone;
    }),
    empCode: z
      .string()
      .trim()
      .max(50, "Keep the employee code under 50 characters.")
      .nullish()
      .transform((code) => code || null),
    birthDay: z.int().min(1, "Choose a valid date.").max(31, "Choose a valid date."),
    birthMonth: z.int().min(1, "Choose a valid date.").max(12, "Choose a valid date."),
    birthYear: z.int().nullable().default(null),
    whatsappConsent: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.birthYear !== null) {
      const thisYear = todayInTimeZone().year;
      if (value.birthYear < MIN_BIRTH_YEAR || value.birthYear > thisYear) {
        ctx.addIssue({
          code: "custom",
          path: ["birthYear"],
          message: `The birth year must be between ${MIN_BIRTH_YEAR} and ${thisYear}.`,
        });
        return;
      }
    }
    if (!isValidBirthday({ day: value.birthDay, month: value.birthMonth, year: value.birthYear })) {
      ctx.addIssue({ code: "custom", path: ["birthDay"], message: "That date doesn't exist." });
    }
  });

export type EmployeeInput = z.output<typeof employeeInputSchema>;
