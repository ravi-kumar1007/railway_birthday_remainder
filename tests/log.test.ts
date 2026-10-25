import { describe, expect, it } from "vitest";
import { describeError, maskPhone } from "@/lib/log";

describe("describeError", () => {
  it("never includes query parameters from a failed query", () => {
    const withCause = new Error("Failed query: insert into employees ... params: +919876543210", {
      cause: new Error('duplicate key value violates unique constraint "employees_phone_unique"'),
    });
    expect(describeError(withCause)).toBe('duplicate key value violates unique constraint "employees_phone_unique"');
    expect(describeError(new Error("Failed query: select 1\nparams: +919876543210"))).toBe("Database query failed");
  });

  it("passes ordinary messages through", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("not an error")).toBe("Unknown error");
  });
});

describe("maskPhone", () => {
  it("keeps the country code and last 4 digits", () => {
    expect(maskPhone("+919876543210")).toBe("+91******3210");
    expect(maskPhone("+14155550123")).toBe("+*******0123");
  });

  it("fully masks very short values", () => {
    expect(maskPhone("12345")).toBe("*****");
  });
});
