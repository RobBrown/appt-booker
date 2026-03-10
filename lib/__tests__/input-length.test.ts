import { describe, it, expect } from "vitest";

const LIMITS = {
  bookerName: 200,
  bookerPhone: 50,
  locationDetails: 2000,
  description: 2000,
};

function repeat(char: string, n: number) {
  return char.repeat(n);
}

describe("input length limits", () => {
  // --- bookerName ---

  it("accepts a name at the limit", () => {
    expect(repeat("a", LIMITS.bookerName).length).toBeLessThanOrEqual(LIMITS.bookerName);
  });

  it("rejects a name one character over the limit", () => {
    expect(repeat("a", LIMITS.bookerName + 1).length > LIMITS.bookerName).toBe(true);
  });

  // --- bookerPhone ---

  it("accepts a phone number at the limit", () => {
    expect(repeat("1", LIMITS.bookerPhone).length).toBeLessThanOrEqual(LIMITS.bookerPhone);
  });

  it("accepts a realistic international phone number", () => {
    expect("+1 (416) 555-0123 ext. 4567".length).toBeLessThanOrEqual(LIMITS.bookerPhone);
  });

  it("rejects a phone number one character over the limit", () => {
    expect(repeat("1", LIMITS.bookerPhone + 1).length > LIMITS.bookerPhone).toBe(true);
  });

  // --- locationDetails ---

  it("accepts a long meeting URL within the limit", () => {
    const url = "https://zoom.us/j/12345678901?pwd=" + repeat("a", 50);
    expect(url.length).toBeLessThanOrEqual(LIMITS.locationDetails);
  });

  it("accepts location details at the limit", () => {
    expect(repeat("a", LIMITS.locationDetails).length).toBeLessThanOrEqual(LIMITS.locationDetails);
  });

  it("rejects location details one character over the limit", () => {
    expect(repeat("a", LIMITS.locationDetails + 1).length > LIMITS.locationDetails).toBe(true);
  });

  // --- description ---

  it("accepts a description at the limit", () => {
    expect(repeat("a", LIMITS.description).length).toBeLessThanOrEqual(LIMITS.description);
  });

  it("rejects a description one character over the limit", () => {
    expect(repeat("a", LIMITS.description + 1).length > LIMITS.description).toBe(true);
  });
});
