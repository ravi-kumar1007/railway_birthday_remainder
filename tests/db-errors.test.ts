import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { rethrowNextErrors, uniqueViolation } from "@/db/errors";

function pgError(fields: Record<string, string>) {
  return Object.assign(new Error("db error"), fields);
}

describe("uniqueViolation", () => {
  it("returns the violated constraint from a failed Drizzle query", () => {
    const error = new DrizzleQueryError("insert ...", ["+919876543210"], pgError({ code: "23505", constraint: "employees_phone_unique" }));
    expect(uniqueViolation(error)).toBe("employees_phone_unique");
  });

  it("ignores other database errors and non-errors", () => {
    expect(uniqueViolation(new DrizzleQueryError("insert ...", [], pgError({ code: "23514", constraint: "employees_phone_e164" })))).toBeNull();
    expect(uniqueViolation(new Error("network"))).toBeNull();
    expect(uniqueViolation("nope")).toBeNull();
  });
});

describe("rethrowNextErrors", () => {
  // What Next.js rejects pending fetches with when it abandons a prerender
  const abandoned = () => Object.assign(new Error("During prerendering, fetch() rejects…"), { digest: "HANGING_PROMISE_REJECTION" });

  it("rethrows a Next.js prerender abort that Neon and Drizzle wrapped", () => {
    // Neon keeps the fetch error in sourceError, not cause, so unstable_rethrow alone misses it
    const neonError = Object.assign(new Error("Error connecting to database: …"), { sourceError: abandoned() });
    const drizzleError = new DrizzleQueryError("select ...", [], neonError);
    expect(() => rethrowNextErrors(drizzleError)).toThrow(/During prerendering/);
  });

  it("lets real database errors through to the caller's handling", () => {
    const neonError = Object.assign(new Error("Error connecting to database: fetch failed"), { sourceError: new TypeError("fetch failed") });
    expect(() => rethrowNextErrors(new DrizzleQueryError("select ...", [], neonError))).not.toThrow();
    expect(() => rethrowNextErrors("nope")).not.toThrow();
  });
});
