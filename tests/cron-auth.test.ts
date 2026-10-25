import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

const SECRET = "a-long-random-cron-secret-value-1234";

describe("isCronAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a missing, wrong, partial or differently formatted header", () => {
    for (const header of [null, "", SECRET, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, `Basic ${SECRET}`, "Bearer "]) {
      expect(isCronAuthorized(header, SECRET), String(header)).toBe(false);
    }
  });
});
