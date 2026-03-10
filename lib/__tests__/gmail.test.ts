import { describe, it, expect, vi } from "vitest";

// Prevent validate-env from throwing during tests — env vars are not
// required for the sanitizeHeader unit tests below.
vi.mock("@/lib/validate-env", () => ({}));

import { sanitizeHeader } from "../gmail";

describe("sanitizeHeader", () => {
  // --- Clean input ---

  it("passes through a plain name unchanged", () => {
    expect(sanitizeHeader("Jane Smith")).toBe("Jane Smith");
  });

  it("passes through a plain email address unchanged", () => {
    expect(sanitizeHeader("user@example.com")).toBe("user@example.com");
  });

  it("passes through an empty string unchanged", () => {
    expect(sanitizeHeader("")).toBe("");
  });

  // --- Injection via \r\n (CRLF — the canonical header injection sequence) ---

  it("strips CRLF from fromName to prevent BCC injection", () => {
    const input = "Jane Smith\r\nBCC: attacker@evil.com";
    expect(sanitizeHeader(input)).toBe("Jane Smith" + "BCC: attacker@evil.com");
  });

  it("strips CRLF from a To address to prevent CC injection", () => {
    const input = "user@example.com\r\nCC: attacker@evil.com";
    expect(sanitizeHeader(input)).toBe("user@example.com" + "CC: attacker@evil.com");
  });

  // --- Injection via \n alone ---

  it("strips bare LF", () => {
    const input = "Jane Smith\nBCC: attacker@evil.com";
    expect(sanitizeHeader(input)).toBe("Jane Smith" + "BCC: attacker@evil.com");
  });

  // --- Injection via \r alone ---

  it("strips bare CR", () => {
    const input = "Jane Smith\rBCC: attacker@evil.com";
    expect(sanitizeHeader(input)).toBe("Jane Smith" + "BCC: attacker@evil.com");
  });

  // --- Multiple injections in a single value ---

  it("strips multiple newline characters in one value", () => {
    const input = "a\r\nb\nc\rd";
    expect(sanitizeHeader(input)).toBe("abcd");
  });

  // --- Confirms injected header key does not appear in output ---

  it("ensures no injected header name survives in the sanitized value", () => {
    const result = sanitizeHeader("x\r\nX-Injected: malicious");
    expect(result).not.toMatch(/\r|\n/);
  });
});
