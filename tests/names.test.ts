import { describe, expect, it } from "vitest";
import { nameForMessage, parseNameFormat } from "@/lib/names";

describe("nameForMessage", () => {
  it("uses the first name by default", () => {
    expect(nameForMessage("Priya Sharma", "first")).toBe("Priya");
    expect(nameForMessage("  Ravi   Kumar  Verma ", "first")).toBe("Ravi");
  });

  it("skips titles in front of the first name", () => {
    expect(nameForMessage("Dr. Ananya Iyer", "first")).toBe("Ananya");
    expect(nameForMessage("Smt Lakshmi Rao", "first")).toBe("Lakshmi");
    expect(nameForMessage("Mr", "first")).toBe("Mr");
  });

  it("uses the whole name when asked", () => {
    expect(nameForMessage("  Priya   Sharma ", "full")).toBe("Priya Sharma");
  });
});

describe("parseNameFormat", () => {
  it("reads the saved setting, defaulting to first names", () => {
    expect(parseNameFormat("full")).toBe("full");
    expect(parseNameFormat("first")).toBe("first");
    expect(parseNameFormat(undefined)).toBe("first");
    expect(parseNameFormat("nickname")).toBe("first");
  });
});
