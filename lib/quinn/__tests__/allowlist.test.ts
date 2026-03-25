import { describe, it, expect, beforeEach, vi } from "vitest";
import { isTrustedSender, _resetCache } from "@/lib/quinn/allowlist";

const TEST_SENDERS = "alice@example.com,bob@example.com,carol@example.com";

describe("isTrustedSender", () => {
  beforeEach(() => {
    vi.stubEnv("QUINN_TRUSTED_SENDERS", TEST_SENDERS);
    _resetCache();
  });

  it("returns true for an address in the allowlist", () => {
    expect(isTrustedSender("alice@example.com")).toBe(true);
    expect(isTrustedSender("bob@example.com")).toBe(true);
    expect(isTrustedSender("carol@example.com")).toBe(true);
  });

  it("returns false for an unknown address", () => {
    expect(isTrustedSender("stranger@example.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isTrustedSender("ALICE@EXAMPLE.COM")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(isTrustedSender("  alice@example.com  ")).toBe(true);
  });

  it("returns false for all senders when env var is empty", () => {
    vi.stubEnv("QUINN_TRUSTED_SENDERS", "");
    _resetCache();
    expect(isTrustedSender("alice@example.com")).toBe(false);
  });

  it("returns false for all senders when env var is missing", () => {
    delete process.env.QUINN_TRUSTED_SENDERS;
    _resetCache();
    expect(isTrustedSender("alice@example.com")).toBe(false);
  });
});
