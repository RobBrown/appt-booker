import { describe, it, expect, beforeEach } from "vitest";
import { composeReply } from "@/lib/quinn/responder";
import type { ActionResult } from "@/lib/quinn/processor";
import type { Intent } from "@/lib/quinn/intent";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeBookIntent(overrides: Partial<{
  assumptions: string[];
  timezone: string;
}> = {}): Intent {
  return {
    intent: "book",
    confidence: "high",
    rawDateText: "tomorrow at 2pm",
    assumptions: overrides.assumptions ?? [],
    requestedDate: "2026-03-25T19:00:00.000Z",
    duration: 30,
    timezone: overrides.timezone ?? "America/Toronto",
    attendeeNames: [],
  };
}

function makeCheckAvailabilityIntent(overrides: Partial<{
  assumptions: string[];
  timezone: string;
}> = {}): Intent {
  return {
    intent: "check_availability",
    confidence: "high",
    rawDateText: "tomorrow",
    assumptions: overrides.assumptions ?? [],
    requestedDate: "2026-03-25",
    duration: 30,
    timezone: overrides.timezone ?? "America/Toronto",
  };
}

function makeRescheduleIntent(): Intent {
  return {
    intent: "reschedule",
    confidence: "high",
    rawDateText: "next Thursday at 3pm",
    assumptions: [],
    bookingReference: "abc123",
    requestedDate: "2026-03-26T20:00:00.000Z",
    timezone: "America/Toronto",
  };
}

function makeCancelIntent(): Intent {
  return {
    intent: "cancel",
    confidence: "high",
    rawDateText: null,
    assumptions: [],
    bookingReference: "abc123",
  };
}

function makeUnknownIntent(question = "Could you clarify?"): Intent {
  return {
    intent: "unknown",
    confidence: "low",
    rawDateText: null,
    assumptions: [],
    clarificationQuestion: question,
  };
}

const BOOKING_TOKEN = "d4f3a8b2-c9e1-4f60-a837-2b5c3e1a7f89";
const TIMEZONE = "America/Toronto";

// ---------------------------------------------------------------------------
// booked result
// ---------------------------------------------------------------------------

describe("composeReply — booked", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const bookedResult: ActionResult = {
    type: "booked",
    token: BOOKING_TOKEN,
    startTime: "2026-03-25T19:00:00.000Z",
    duration: 30,
  };

  it("includes a formatted 12h time", () => {
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    // 7:00 PM in 12h format
    expect(reply).toMatch(/3:00\s*[Pp][Mm]/);
  });

  it("includes the duration in the reply", () => {
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).toContain("30");
  });

  it("includes the management link with correct token", () => {
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).toContain(`https://book.robisit.com/manage/${BOOKING_TOKEN}`);
  });

  it("uses HOST_URL env var for management link", () => {
    process.env.HOST_URL = "https://example.com";
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).toContain(`https://example.com/manage/${BOOKING_TOKEN}`);
  });

  it("defaults HOST_URL to https://book.robisit.com when env is unset", () => {
    delete process.env.HOST_URL;
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).toContain(`https://book.robisit.com/manage/${BOOKING_TOKEN}`);
    // Restore
    process.env.HOST_URL = "https://book.robisit.com";
  });

  it("ends with Quinn signature and Who is Quinn link", () => {
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).toContain("\nQuinn\n");
    expect(reply).toContain("Who is Quinn?");
  });

  it("does not include assumptions in reply", () => {
    const intent = makeBookIntent({ assumptions: ["Assumed 30-minute duration"] });
    const { text: reply } = composeReply(intent, bookedResult, { timezone: TIMEZONE });
    expect(reply).not.toContain("Assumed");
    expect(reply).not.toContain("couple of notes");
  });

  it("includes substituted time note when slot was changed", () => {
    const resultWithSub: ActionResult = {
      type: "booked",
      token: BOOKING_TOKEN,
      startTime: "2026-03-25T19:30:00.000Z",
      duration: 30,
      substituted: { requested: "14:00", booked: "14:30" },
    };
    const { text: reply } = composeReply(makeBookIntent(), resultWithSub, { timezone: TIMEZONE });
    expect(reply).toMatch(/taken|unavailable/i);
    expect(reply).toContain("14:00");
    expect(reply).toContain("14:30");
  });

  it("does not include substituted note when slot was not changed", () => {
    const { text: reply } = composeReply(makeBookIntent(), bookedResult, { timezone: TIMEZONE });
    expect(reply).not.toMatch(/taken|unavailable/i);
  });
});

// ---------------------------------------------------------------------------
// availability_listed result
// ---------------------------------------------------------------------------

describe("composeReply — availability_listed", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const availResult: ActionResult = {
    type: "availability_listed",
    slots: ["09:00", "10:00", "14:00"],
    date: "2026-03-25",
    duration: 30,
    timezone: TIMEZONE,
  };

  it("lists each slot in 12h format", () => {
    const { text: reply } = composeReply(makeCheckAvailabilityIntent(), availResult, { timezone: TIMEZONE });
    expect(reply).toMatch(/9:00\s*[Aa][Mm]/);
    expect(reply).toMatch(/10:00\s*[Aa][Mm]/);
    expect(reply).toMatch(/2:00\s*[Pp][Mm]/);
  });

  it("includes the date in the reply", () => {
    const { text: reply } = composeReply(makeCheckAvailabilityIntent(), availResult, { timezone: TIMEZONE });
    expect(reply).toContain("2026-03-25");
  });

  it("ends with Quinn signature", () => {
    const { text: reply } = composeReply(makeCheckAvailabilityIntent(), availResult, { timezone: TIMEZONE });
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });

  it("does not include assumptions in reply", () => {
    const intent = makeCheckAvailabilityIntent({ assumptions: ["Assumed 30-minute duration"] });
    const { text: reply } = composeReply(intent, availResult, { timezone: TIMEZONE });
    expect(reply).not.toContain("Assumed");
  });

  it("handles empty slots gracefully", () => {
    const emptyResult: ActionResult = {
      type: "availability_listed",
      slots: [],
      date: "2026-03-25",
      duration: 30,
      timezone: TIMEZONE,
    };
    const { text: reply } = composeReply(makeCheckAvailabilityIntent(), emptyResult, { timezone: TIMEZONE });
    expect(reply).toMatch(/no.*available|nothing.*available/i);
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });
});

// ---------------------------------------------------------------------------
// rescheduled result
// ---------------------------------------------------------------------------

describe("composeReply — rescheduled", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const rescheduledResult: ActionResult = {
    type: "rescheduled",
    token: BOOKING_TOKEN,
    newStartTime: "2026-03-26T20:00:00.000Z",
  };

  it("confirms the reschedule with new time in 12h format", () => {
    const { text: reply } = composeReply(makeRescheduleIntent(), rescheduledResult, { timezone: TIMEZONE });
    expect(reply).toMatch(/4:00\s*[Pp][Mm]/);
  });

  it("includes the management link", () => {
    const { text: reply } = composeReply(makeRescheduleIntent(), rescheduledResult, { timezone: TIMEZONE });
    expect(reply).toContain(`https://book.robisit.com/manage/${BOOKING_TOKEN}`);
  });

  it("ends with Quinn signature", () => {
    const { text: reply } = composeReply(makeRescheduleIntent(), rescheduledResult, { timezone: TIMEZONE });
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });
});

// ---------------------------------------------------------------------------
// cancelled result
// ---------------------------------------------------------------------------

describe("composeReply — cancelled", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const cancelledResult: ActionResult = {
    type: "cancelled",
    token: BOOKING_TOKEN,
  };

  it("confirms cancellation", () => {
    const { text: reply } = composeReply(makeCancelIntent(), cancelledResult, { timezone: TIMEZONE });
    expect(reply).toMatch(/cancel/i);
  });

  it("ends with Quinn signature", () => {
    const { text: reply } = composeReply(makeCancelIntent(), cancelledResult, { timezone: TIMEZONE });
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });
});

// ---------------------------------------------------------------------------
// clarification_needed result
// ---------------------------------------------------------------------------

describe("composeReply — clarification_needed", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const clarificationResult: ActionResult = {
    type: "clarification_needed",
    reason: "I couldn't find the booking reference.",
  };

  it("includes the reason text", () => {
    const { text: reply } = composeReply(makeUnknownIntent(), clarificationResult, { timezone: TIMEZONE });
    expect(reply).toContain("I couldn't find the booking reference.");
  });

  it("lists what Quinn can do", () => {
    const { text: reply } = composeReply(makeUnknownIntent(), clarificationResult, { timezone: TIMEZONE });
    expect(reply).toMatch(/book/i);
    expect(reply).toMatch(/availability|available/i);
    expect(reply).toMatch(/reschedule/i);
    expect(reply).toMatch(/cancel/i);
  });

  it("ends with Quinn signature", () => {
    const { text: reply } = composeReply(makeUnknownIntent(), clarificationResult, { timezone: TIMEZONE });
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });
});

// ---------------------------------------------------------------------------
// error result
// ---------------------------------------------------------------------------

describe("composeReply — error", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const errorResult: ActionResult = {
    type: "error",
    userMessage: "No slots available for that date.",
  };

  it("includes the user message", () => {
    const { text: reply } = composeReply(makeUnknownIntent(), errorResult, { timezone: TIMEZONE });
    expect(reply).toContain("No slots available for that date.");
  });

  it("ends with Quinn signature", () => {
    const { text: reply } = composeReply(makeUnknownIntent(), errorResult, { timezone: TIMEZONE });
    expect(reply.trimEnd()).toMatch(/\nQuinn$/);
  });
});

// ---------------------------------------------------------------------------
// Forbidden words — must not appear in ANY reply type
// ---------------------------------------------------------------------------

describe("composeReply — no forbidden words", () => {
  beforeEach(() => {
    process.env.HOST_URL = "https://book.robisit.com";
  });

  const allResults: Array<[string, Intent, ActionResult]> = [
    [
      "booked",
      makeBookIntent(),
      { type: "booked", token: BOOKING_TOKEN, startTime: "2026-03-25T19:00:00.000Z", duration: 30 },
    ],
    [
      "availability_listed",
      makeCheckAvailabilityIntent(),
      { type: "availability_listed", slots: ["09:00"], date: "2026-03-25", duration: 30, timezone: TIMEZONE },
    ],
    [
      "rescheduled",
      makeRescheduleIntent(),
      { type: "rescheduled", token: BOOKING_TOKEN, newStartTime: "2026-03-26T20:00:00.000Z" },
    ],
    [
      "cancelled",
      makeCancelIntent(),
      { type: "cancelled", token: BOOKING_TOKEN },
    ],
    [
      "clarification_needed",
      makeUnknownIntent(),
      { type: "clarification_needed", reason: "Couldn't parse intent." },
    ],
    [
      "error",
      makeUnknownIntent(),
      { type: "error", userMessage: "Something went wrong." },
    ],
  ];

  const FORBIDDEN = ["AI", "automated", "bot", "system", "error code"];

  for (const [label, intent, result] of allResults) {
    it(`no forbidden words in ${label} reply`, () => {
      const { text: reply } = composeReply(intent, result, { timezone: TIMEZONE });
      for (const word of FORBIDDEN) {
        expect(reply, `should not contain "${word}"`).not.toContain(word);
      }
    });
  }
});
