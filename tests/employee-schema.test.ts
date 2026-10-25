import { describe, expect, it } from "vitest";
import { employeeInputSchema } from "@/lib/employee-schema";

const valid = {
  name: "  Priya   Sharma ",
  phone: "98765 43210",
  empCode: " E-101 ",
  birthDay: 15,
  birthMonth: 8,
  birthYear: 1990,
  whatsappConsent: true,
};

function issuePaths(input: unknown) {
  const result = employeeInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("employeeInputSchema", () => {
  it("normalizes name, phone and emp code", () => {
    expect(employeeInputSchema.parse(valid)).toEqual({
      name: "Priya Sharma",
      phone: "+919876543210",
      empCode: "E-101",
      birthDay: 15,
      birthMonth: 8,
      birthYear: 1990,
      whatsappConsent: true,
    });
  });

  it("stores a blank or missing emp code as null and defaults consent to false", () => {
    const rest = { name: valid.name, phone: valid.phone, birthDay: 15, birthMonth: 8, birthYear: 1990 };
    expect(employeeInputSchema.parse({ ...rest, empCode: "  " })).toMatchObject({ empCode: null, whatsappConsent: false });
    expect(employeeInputSchema.parse(rest)).toMatchObject({ empCode: null });
  });

  it("puts each problem on its own field", () => {
    expect(issuePaths({ ...valid, name: "   " })).toEqual(["name"]);
    expect(issuePaths({ ...valid, phone: "12345" })).toEqual(["phone"]);
  });

  it("rejects impossible birthdays and implausible years", () => {
    expect(issuePaths({ ...valid, birthDay: 30, birthMonth: 2 })).toEqual(["birthDay"]);
    expect(issuePaths({ ...valid, birthDay: 29, birthMonth: 2, birthYear: 1995 })).toEqual(["birthDay"]);
    expect(issuePaths({ ...valid, birthYear: 1899 })).toEqual(["birthYear"]);
    expect(issuePaths({ ...valid, birthYear: new Date().getFullYear() + 1 })).toEqual(["birthYear"]);
  });

  it("accepts an unknown birth year, including 29 Feb", () => {
    expect(employeeInputSchema.parse({ ...valid, birthDay: 29, birthMonth: 2, birthYear: null })).toMatchObject({
      birthDay: 29,
      birthMonth: 2,
      birthYear: null,
    });
  });
});
