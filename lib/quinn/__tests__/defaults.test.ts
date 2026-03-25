import { describe, it, expect } from "vitest";
import { resolveDefaults, resolveNextWeekday } from "@/lib/quinn/defaults";
import type {
  BookIntent,
  RescheduleIntent,
  CancelIntent,
  CheckAvailabilityIntent,
  UnknownIntent,
} from "@/lib/quinn/intent";

// ---------------------------------------------------------------------------
// Reference date: Wednesday 2026-03-25
// ---------------------------------------------------------------------------

const REF_DATE = new Date("2026-03-25T12:00:00Z");

// ---------------------------------------------------------------------------
// Fixtures — plain objects matching the Zod schema shape
// ---------------------------------------------------------------------------

function makeBookIntent(overrides: Partial<BookIntent> = {}): BookIntent {
  return {
    intent: "book",
    confidence: "high",
    rawDateText: null,
    assumptions: [],
    requestedDate: null,
    duration: null,
    timezone: null,
    attendeeNames: [],
    ...overrides,
  };
}

function makeRescheduleIntent(
  overrides: Partial<RescheduleIntent> = {}
): RescheduleIntent {
  return {
    intent: "reschedule",
    confidence: "high",
    rawDateText: null,
    assumptions: [],
    bookingReference: null,
    requestedDate: null,
    timezone: null,
    ...overrides,
  };
}

function makeCancelIntent(
  overrides: Partial<CancelIntent> = {}
): CancelIntent {
  return {
    intent: "cancel",
    confidence: "high",
    rawDateText: null,
    assumptions: [],
    bookingReference: null,
    ...overrides,
  };
}

function makeCheckAvailabilityIntent(
  overrides: Partial<CheckAvailabilityIntent> = {}
): CheckAvailabilityIntent {
  return {
    intent: "check_availability",
    confidence: "high",
    rawDateText: null,
    assumptions: [],
    requestedDate: null,
    duration: null,
    timezone: null,
    ...overrides,
  };
}

function makeUnknownIntent(
  overrides: Partial<UnknownIntent> = {}
): UnknownIntent {
  return {
    intent: "unknown",
    confidence: "low",
    rawDateText: null,
    assumptions: [],
    clarificationQuestion: "What would you like to do?",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveNextWeekday
// ---------------------------------------------------------------------------

describe("resolveNextWeekday", () => {
  // Wednesday 2026-03-25 as reference

  it("resolves Tuesday to next Tuesday (2026-03-31) from a Wednesday", () => {
    const result = resolveNextWeekday("Tuesday", REF_DATE);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("resolves Wednesday to NEXT Wednesday (2026-04-01) — never today", () => {
    const result = resolveNextWeekday("Wednesday", REF_DATE);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("resolves Thursday to 2026-03-26 (1 day forward)", () => {
    const result = resolveNextWeekday("Thursday", REF_DATE);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-26");
  });

  it("resolves Sunday to 2026-03-29 (4 days forward)", () => {
    const result = resolveNextWeekday("Sunday", REF_DATE);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-29");
  });

  it("is case insensitive — 'sunday' resolves the same as 'Sunday'", () => {
    const lower = resolveNextWeekday("sunday", REF_DATE);
    const upper = resolveNextWeekday("Sunday", REF_DATE);
    expect(lower.toISOString().slice(0, 10)).toBe(
      upper.toISOString().slice(0, 10)
    );
  });

  it("throws Error for an unrecognised day name", () => {
    expect(() => resolveNextWeekday("InvalidDay", REF_DATE)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — duration
// ---------------------------------------------------------------------------

describe("resolveDefaults — duration defaults", () => {
  it("sets duration to 30 when missing on a book intent", () => {
    const intent = makeBookIntent({ duration: null });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.intent).toBe("book");
    if (result.intent === "book") {
      expect(result.duration).toBe(30);
    }
  });

  it("adds duration assumption message when duration was null", () => {
    const intent = makeBookIntent({ duration: null });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.assumptions).toContain(
      "Assumed 30-minute duration since none was specified"
    );
  });

  it("keeps existing duration (60) and does NOT add duration assumption", () => {
    const intent = makeBookIntent({ duration: 60 });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.duration).toBe(60);
    }
    expect(result.assumptions).not.toContain(
      "Assumed 30-minute duration since none was specified"
    );
  });

  it("applies duration default to check_availability intent", () => {
    const intent = makeCheckAvailabilityIntent({ duration: null });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "check_availability") {
      expect(result.duration).toBe(30);
    }
    expect(result.assumptions).toContain(
      "Assumed 30-minute duration since none was specified"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — timezone
// ---------------------------------------------------------------------------

describe("resolveDefaults — timezone defaults", () => {
  it("sets timezone to America/Toronto when missing on a book intent", () => {
    const intent = makeBookIntent({ timezone: null });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.timezone).toBe("America/Toronto");
    }
  });

  it("adds timezone assumption message when timezone was null", () => {
    const intent = makeBookIntent({ timezone: null });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.assumptions).toContain(
      "Assumed America/Toronto timezone since none was specified"
    );
  });

  it("keeps existing timezone and does NOT add timezone assumption", () => {
    const intent = makeBookIntent({ timezone: "America/New_York" });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.timezone).toBe("America/New_York");
    }
    expect(result.assumptions).not.toContain(
      "Assumed America/Toronto timezone since none was specified"
    );
  });

  it("applies timezone default to reschedule intent", () => {
    const intent = makeRescheduleIntent({ timezone: null });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "reschedule") {
      expect(result.timezone).toBe("America/Toronto");
    }
    expect(result.assumptions).toContain(
      "Assumed America/Toronto timezone since none was specified"
    );
  });

  it("applies timezone default to check_availability intent", () => {
    const intent = makeCheckAvailabilityIntent({ timezone: null });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "check_availability") {
      expect(result.timezone).toBe("America/Toronto");
    }
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — both duration and timezone missing
// ---------------------------------------------------------------------------

describe("resolveDefaults — both duration and timezone missing", () => {
  it("applies both defaults and records both assumptions", () => {
    const intent = makeBookIntent({ duration: null, timezone: null });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.duration).toBe(30);
      expect(result.timezone).toBe("America/Toronto");
    }
    expect(result.assumptions).toContain(
      "Assumed 30-minute duration since none was specified"
    );
    expect(result.assumptions).toContain(
      "Assumed America/Toronto timezone since none was specified"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — preserving existing assumptions
// ---------------------------------------------------------------------------

describe("resolveDefaults — preserves existing assumptions", () => {
  it("appends new assumptions to existing ones from Claude, does not replace", () => {
    const existingAssumption = "User probably meant next week";
    const intent = makeBookIntent({
      duration: null,
      timezone: null,
      assumptions: [existingAssumption],
    });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.assumptions).toContain(existingAssumption);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — cancel and unknown intents unchanged
// ---------------------------------------------------------------------------

describe("resolveDefaults — cancel and unknown intents unchanged", () => {
  it("returns cancel intent unchanged (no duration/timezone fields)", () => {
    const intent = makeCancelIntent({
      assumptions: ["some assumption"],
    });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.intent).toBe("cancel");
    expect(result.assumptions).toEqual(["some assumption"]);
  });

  it("returns unknown intent unchanged", () => {
    const intent = makeUnknownIntent({
      assumptions: ["some assumption"],
    });
    const result = resolveDefaults(intent, REF_DATE);
    expect(result.intent).toBe("unknown");
    expect(result.assumptions).toEqual(["some assumption"]);
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — immutability (no mutation of input)
// ---------------------------------------------------------------------------

describe("resolveDefaults — immutability", () => {
  it("does not mutate the input intent object", () => {
    const intent = makeBookIntent({ duration: null, timezone: null });
    const originalAssumptions = [...intent.assumptions];
    resolveDefaults(intent, REF_DATE);
    expect(intent.duration).toBeNull();
    expect(intent.timezone).toBeNull();
    expect(intent.assumptions).toEqual(originalAssumptions);
  });
});

// ---------------------------------------------------------------------------
// resolveDefaults — rawDateText resolution
// ---------------------------------------------------------------------------

describe("resolveDefaults — rawDateText date resolution", () => {
  it("resolves 'next Tuesday' to 2026-03-31 when reference is Wednesday 2026-03-25", () => {
    const intent = makeBookIntent({
      rawDateText: "next Tuesday",
      requestedDate: null,
      timezone: "America/Toronto",
    });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.requestedDate).not.toBeNull();
      expect(result.requestedDate).toMatch(/^2026-03-31/);
    }
  });

  it("adds a resolution assumption for rawDateText date resolution", () => {
    const intent = makeBookIntent({
      rawDateText: "next Tuesday",
      requestedDate: null,
      timezone: "America/Toronto",
    });
    const result = resolveDefaults(intent, REF_DATE);
    const hasDateAssumption = result.assumptions.some((a) =>
      a.includes("2026-03-31")
    );
    expect(hasDateAssumption).toBe(true);
  });

  it("resolves 'next Tuesday at 2pm' to a datetime in 2026-03-31 in UTC", () => {
    const intent = makeBookIntent({
      rawDateText: "next Tuesday at 2pm",
      requestedDate: null,
      timezone: "America/Toronto",
    });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.requestedDate).not.toBeNull();
      // 2pm America/Toronto (EDT, UTC-4) = 18:00 UTC on 2026-03-31
      expect(result.requestedDate).toMatch(/^2026-03-31T18:00/);
    }
  });

  it("passes through an existing ISO date string unchanged", () => {
    const intent = makeBookIntent({
      rawDateText: "2026-04-15",
      requestedDate: "2026-04-15",
      timezone: "America/Toronto",
    });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.requestedDate).toBe("2026-04-15");
    }
  });

  it("leaves requestedDate null when rawDateText is null and no date info", () => {
    const intent = makeBookIntent({
      rawDateText: null,
      requestedDate: null,
      timezone: "America/Toronto",
    });
    const result = resolveDefaults(intent, REF_DATE);
    if (result.intent === "book") {
      expect(result.requestedDate).toBeNull();
    }
  });
});
