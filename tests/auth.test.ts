import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { getLockout, LOCKOUT_MS, lockoutMessage, type AttemptRow } from "@/lib/auth/lockout";
import { getClientIp, safeNextPath } from "@/lib/auth/request";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("round-trips the admin email", async () => {
    const token = await signSessionToken("admin@example.com", SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toEqual({ email: "admin@example.com" });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSessionToken("admin@example.com", SECRET);
    await expect(verifySessionToken(token, "y".repeat(40))).resolves.toBeNull();
  });

  it("rejects tampered, missing and expired tokens", async () => {
    const token = await signSessionToken("admin@example.com", SECRET);
    await expect(verifySessionToken(token.slice(0, -2) + "xx", SECRET)).resolves.toBeNull();
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken(token, undefined)).resolves.toBeNull();

    const expired = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin@example.com")
      .setIssuer("birthday-wishes")
      .setAudience("birthday-wishes-admin")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySessionToken(expired, SECRET)).resolves.toBeNull();
  });

  it("rejects a valid signature without the admin role", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin@example.com")
      .setIssuer("birthday-wishes")
      .setAudience("birthday-wishes-admin")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySessionToken(token, SECRET)).resolves.toBeNull();
  });
});

describe("login lockout", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const fail = (m: number): AttemptRow => ({ attemptedAt: minutesAgo(m), success: false });
  const ok = (m: number): AttemptRow => ({ attemptedAt: minutesAgo(m), success: true });

  it("allows up to 4 failures", () => {
    expect(getLockout([fail(1), fail(2), fail(3), fail(4)], now)).toEqual({ locked: false });
  });

  it("locks for 15 minutes after the 5th failure", () => {
    const result = getLockout([fail(1), fail(2), fail(3), fail(4), fail(5)], now);
    expect(result).toEqual({ locked: true, until: new Date(minutesAgo(1).getTime() + LOCKOUT_MS) });
  });

  it("unlocks once 15 minutes have passed since the 5th failure", () => {
    expect(getLockout([fail(15), fail(16), fail(17), fail(18), fail(19)], now)).toEqual({ locked: false });
  });

  it("does not count failures from before a successful login", () => {
    expect(getLockout([fail(1), fail(2), ok(3), fail(4), fail(5)], now)).toEqual({ locked: false });
  });

  it("ignores five failures spread over more than 15 minutes", () => {
    expect(getLockout([fail(1), fail(5), fail(10), fail(14), fail(17)], now)).toEqual({ locked: false });
  });

  it("formats the remaining wait in minutes", () => {
    expect(lockoutMessage(new Date(now.getTime() + 14 * 60_000 + 1), now)).toBe(
      "Too many failed attempts. Try again in 15 minutes.",
    );
    expect(lockoutMessage(new Date(now.getTime() + 1000), now)).toBe(
      "Too many failed attempts. Try again in 1 minute.",
    );
  });
});

describe("getClientIp", () => {
  it("prefers the host-set client IP over X-Forwarded-For", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-nf-client-connection-ip": "2.2.2.2" });
    expect(getClientIp(h)).toBe("2.2.2.2");
    expect(getClientIp(new Headers({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "6.6.6.6" }))).toBe("3.3.3.3");
  });

  it("falls back to the first X-Forwarded-For entry, then 'unknown'", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "4.4.4.4, 10.0.0.1" }))).toBe("4.4.4.4");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("safeNextPath", () => {
  it("keeps admin paths", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/admin/employees?page=2")).toBe("/admin/employees?page=2");
  });

  it("rejects anything that could leave the admin area or the site", () => {
    for (const bad of [undefined, null, "", "/", "https://evil.example", "//evil.example", "/administrator", "/admin\\..\\x", "/login"]) {
      expect(safeNextPath(bad)).toBe("/admin");
    }
  });
});

describe("environment checks", () => {
  it("reports a blank setting as not set, naming it but never showing values", async () => {
    const { metaConfigProblem } = await import("@/lib/env");
    const saved = { ...process.env };
    Object.assign(process.env, { META_GRAPH_VERSION: "v26.0", META_ACCESS_TOKEN: "", META_WABA_ID: "123", META_PHONE_NUMBER_ID: "456" });
    try {
      expect(metaConfigProblem()).toBe("Invalid Meta WhatsApp environment variables: META_ACCESS_TOKEN: is not set");
    } finally {
      process.env = saved;
    }
  });
});
