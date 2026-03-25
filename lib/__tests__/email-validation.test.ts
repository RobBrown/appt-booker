import { describe, it, expect } from "vitest";

// Mirrors the regex used in app/api/bookings/route.ts
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

describe("server-side email validation", () => {
  // --- Valid emails ---

  it("accepts a standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts an email with a subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true);
  });

  it("accepts an email with plus addressing", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("accepts an email with dots in the local part", () => {
    expect(isValidEmail("first.last@example.com")).toBe(true);
  });

  // --- Invalid emails ---

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects a value with no @ symbol", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  it("rejects a value with no domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects a value with no TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("rejects a value with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  it("rejects a value with only an @ symbol", () => {
    expect(isValidEmail("@")).toBe(false);
  });
});
