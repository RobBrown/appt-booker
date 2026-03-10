import { describe, it, expect } from "vitest";

// Test the timezone validation logic directly — no need to spin up the
// full Next.js route for this pure validation check.

function isValidTimezone(tz: string): boolean {
  return tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz);
}

describe("timezone validation", () => {
  // --- Valid timezones ---

  it("accepts America/New_York", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("accepts America/Vancouver", () => {
    expect(isValidTimezone("America/Vancouver")).toBe(true);
  });

  it("accepts UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("accepts Europe/London", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
  });

  it("accepts Asia/Tokyo", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  // --- Invalid timezones ---

  it("rejects a plain garbage string", () => {
    expect(isValidTimezone("garbage")).toBe(false);
  });

  it("rejects a fake IANA-style timezone", () => {
    expect(isValidTimezone("America/Fakeville")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTimezone("")).toBe(false);
  });

  it("rejects a log injection attempt", () => {
    expect(isValidTimezone("America/New_York\nX-Injected: true")).toBe(false);
  });

  it("rejects a CRLF injection attempt", () => {
    expect(isValidTimezone("UTC\r\nX-Injected: true")).toBe(false);
  });
});
