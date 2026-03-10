import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "crypto";

// Mirrors the auth logic in app/api/cron/reminders/route.ts
function isAuthorised(cronSecret: string | undefined, authHeader: string | null): boolean {
  const provided = authHeader ?? "";
  const expected = cronSecret ? `Bearer ${cronSecret}` : "";
  return (
    !!cronSecret &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  );
}

const SECRET = "abc123";

describe("cron authorisation", () => {
  // --- Authorised ---

  it("allows a correct Bearer token", () => {
    expect(isAuthorised(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });

  // --- Unauthorised ---

  it("rejects a missing Authorization header", () => {
    expect(isAuthorised(SECRET, null)).toBe(false);
  });

  it("rejects an empty Authorization header", () => {
    expect(isAuthorised(SECRET, "")).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorised(SECRET, "Bearer wrongsecret")).toBe(false);
  });

  it("rejects a token without Bearer prefix", () => {
    expect(isAuthorised(SECRET, SECRET)).toBe(false);
  });

  it("rejects when CRON_SECRET is not set", () => {
    expect(isAuthorised(undefined, `Bearer ${SECRET}`)).toBe(false);
  });

  it("rejects when CRON_SECRET is empty string", () => {
    expect(isAuthorised("", `Bearer ${SECRET}`)).toBe(false);
  });

  it("rejects a token with extra whitespace", () => {
    expect(isAuthorised(SECRET, `Bearer ${SECRET} `)).toBe(false);
  });
});
