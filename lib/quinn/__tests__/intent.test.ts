import { describe, it, expect } from "vitest";
import {
  IntentSchema,
  BookIntentSchema,
  RescheduleIntentSchema,
  CancelIntentSchema,
  CheckAvailabilityIntentSchema,
  UnknownIntentSchema,
} from "@/lib/quinn/intent";

// ---------------------------------------------------------------------------
// Valid book intent objects
// ---------------------------------------------------------------------------

const validBookAllFields = {
  intent: "book",
  confidence: "high",
  rawDateText: "next Tuesday at 2pm",
  assumptions: [],
  requestedDate: "2026-03-31",
  duration: 30,
  timezone: "America/Toronto",
  attendeeNames: ["Alice", "Bob"],
};

const validBookNullOptionals = {
  intent: "book",
  confidence: "medium",
  rawDateText: null,
  assumptions: ["Default duration: 30 minutes"],
  requestedDate: null,
  duration: null,
  timezone: null,
  attendeeNames: [],
};

const validReschedule = {
  intent: "reschedule",
  confidence: "high",
  rawDateText: "next Friday",
  assumptions: [],
  bookingReference: "tok_abc123",
  requestedDate: "2026-04-03",
  timezone: "America/Toronto",
};

const validRescheduleNullRef = {
  intent: "reschedule",
  confidence: "low",
  rawDateText: "Thursday morning",
  assumptions: [],
  bookingReference: null,
  requestedDate: null,
  timezone: null,
};

const validCancel = {
  intent: "cancel",
  confidence: "high",
  rawDateText: null,
  assumptions: [],
  bookingReference: "tok_xyz789",
};

const validCancelNullRef = {
  intent: "cancel",
  confidence: "medium",
  rawDateText: null,
  assumptions: [],
  bookingReference: null,
};

const validCheckAvailability = {
  intent: "check_availability",
  confidence: "high",
  rawDateText: "next Monday",
  assumptions: [],
  requestedDate: "2026-03-30",
  duration: 60,
  timezone: "America/Toronto",
};

const validCheckAvailabilityNulls = {
  intent: "check_availability",
  confidence: "low",
  rawDateText: null,
  assumptions: [],
  requestedDate: null,
  duration: null,
  timezone: null,
};

const validUnknown = {
  intent: "unknown",
  confidence: "low",
  rawDateText: null,
  assumptions: [],
  clarificationQuestion: "Could you let me know what you'd like to schedule?",
};

// ---------------------------------------------------------------------------
// IntentSchema discriminated union
// ---------------------------------------------------------------------------

describe("IntentSchema (discriminated union)", () => {
  it("parses a valid book intent with all fields", () => {
    const result = IntentSchema.safeParse(validBookAllFields);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("book");
      expect(result.data.confidence).toBe("high");
    }
  });

  it("parses a valid book intent with null optional fields", () => {
    const result = IntentSchema.safeParse(validBookNullOptionals);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("book");
    }
  });

  it("parses a valid reschedule intent with bookingReference", () => {
    const result = IntentSchema.safeParse(validReschedule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("reschedule");
    }
  });

  it("parses a valid cancel intent with bookingReference", () => {
    const result = IntentSchema.safeParse(validCancel);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("cancel");
    }
  });

  it("parses a valid check_availability intent", () => {
    const result = IntentSchema.safeParse(validCheckAvailability);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("check_availability");
    }
  });

  it("parses a valid unknown intent with clarificationQuestion", () => {
    const result = IntentSchema.safeParse(validUnknown);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe("unknown");
      expect(result.data.clarificationQuestion).toBe(
        "Could you let me know what you'd like to schedule?"
      );
    }
  });

  it("rejects an invalid intent (wrong discriminator value 'delete')", () => {
    const result = IntentSchema.safeParse({
      ...validBookAllFields,
      intent: "delete",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an intent missing required fields (no confidence)", () => {
    const { confidence: _c, ...withoutConfidence } = validBookAllFields;
    const result = IntentSchema.safeParse(withoutConfidence);
    expect(result.success).toBe(false);
  });

  it("rejects a book intent with wrong field type (duration as string)", () => {
    const result = IntentSchema.safeParse({
      ...validBookAllFields,
      duration: "30",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown intent missing clarificationQuestion", () => {
    const { clarificationQuestion: _q, ...withoutQuestion } = validUnknown;
    const result = IntentSchema.safeParse(withoutQuestion);
    expect(result.success).toBe(false);
  });

  it("handles 'null' string in rawDateText via preprocess (converts to null)", () => {
    const result = IntentSchema.safeParse({
      ...validBookAllFields,
      rawDateText: "null",
    });
    // Should succeed — "null" string is preprocessed to JSON null
    expect(result.success).toBe(true);
    if (result.success && result.data.intent === "book") {
      expect(result.data.rawDateText).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Individual variant schemas
// ---------------------------------------------------------------------------

describe("BookIntentSchema", () => {
  it("parses a valid book intent", () => {
    expect(BookIntentSchema.safeParse(validBookAllFields).success).toBe(true);
  });

  it("parses a book intent with null optionals", () => {
    expect(BookIntentSchema.safeParse(validBookNullOptionals).success).toBe(
      true
    );
  });

  it("requires intent literal 'book'", () => {
    const result = BookIntentSchema.safeParse({
      ...validBookAllFields,
      intent: "cancel",
    });
    expect(result.success).toBe(false);
  });

  it("requires attendeeNames array", () => {
    const { attendeeNames: _a, ...without } = validBookAllFields;
    expect(BookIntentSchema.safeParse(without).success).toBe(false);
  });
});

describe("RescheduleIntentSchema", () => {
  it("parses a valid reschedule intent", () => {
    expect(RescheduleIntentSchema.safeParse(validReschedule).success).toBe(
      true
    );
  });

  it("parses a reschedule intent with null bookingReference", () => {
    expect(
      RescheduleIntentSchema.safeParse(validRescheduleNullRef).success
    ).toBe(true);
  });
});

describe("CancelIntentSchema", () => {
  it("parses a valid cancel intent", () => {
    expect(CancelIntentSchema.safeParse(validCancel).success).toBe(true);
  });

  it("parses a cancel intent with null bookingReference", () => {
    expect(CancelIntentSchema.safeParse(validCancelNullRef).success).toBe(true);
  });
});

describe("CheckAvailabilityIntentSchema", () => {
  it("parses a valid check_availability intent", () => {
    expect(
      CheckAvailabilityIntentSchema.safeParse(validCheckAvailability).success
    ).toBe(true);
  });

  it("parses with null fields", () => {
    expect(
      CheckAvailabilityIntentSchema.safeParse(validCheckAvailabilityNulls)
        .success
    ).toBe(true);
  });
});

describe("UnknownIntentSchema", () => {
  it("parses a valid unknown intent", () => {
    expect(UnknownIntentSchema.safeParse(validUnknown).success).toBe(true);
  });

  it("requires clarificationQuestion", () => {
    const { clarificationQuestion: _q, ...without } = validUnknown;
    expect(UnknownIntentSchema.safeParse(without).success).toBe(false);
  });
});
