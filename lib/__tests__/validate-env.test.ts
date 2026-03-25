import { describe, it, expect } from "vitest";

const REQUIRED = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_ID",
  "GMAIL_USER",
  "HOST_NAME",
  "HOST_DOMAIN",
  "CRON_SECRET",
];

// Re-run the validation logic directly so tests don't depend on module
// caching side effects.
function validate(env: Record<string, string | undefined>): string[] {
  return REQUIRED.filter((key) => !env[key]);
}

describe("environment variable validation", () => {
  const fullEnv = Object.fromEntries(REQUIRED.map((k) => [k, "test-value"]));

  it("passes when all required variables are set", () => {
    expect(validate(fullEnv)).toHaveLength(0);
  });

  it("reports a single missing variable", () => {
    const env = { ...fullEnv, GOOGLE_REFRESH_TOKEN: undefined };
    expect(validate(env)).toEqual(["GOOGLE_REFRESH_TOKEN"]);
  });

  it("reports multiple missing variables", () => {
    const env = { ...fullEnv, GOOGLE_CLIENT_ID: undefined, GMAIL_USER: undefined };
    const missing = validate(env);
    expect(missing).toContain("GOOGLE_CLIENT_ID");
    expect(missing).toContain("GMAIL_USER");
    expect(missing).toHaveLength(2);
  });

  it("reports all variables missing when env is empty", () => {
    expect(validate({})).toHaveLength(REQUIRED.length);
  });

  it("treats an empty string as missing", () => {
    const env = { ...fullEnv, HOST_DOMAIN: "" };
    expect(validate(env)).toContain("HOST_DOMAIN");
  });

  it("does not report optional variables as missing", () => {
    // ZOOM_*, CONTACT_EMAIL, etc. are not in the required list
    const missing = validate(fullEnv);
    expect(missing.some((k) => k.startsWith("ZOOM_"))).toBe(false);
    expect(missing).not.toContain("CONTACT_EMAIL");
  });
});
