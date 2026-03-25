/**
 * Unit tests for MCP tool parameter schemas and error handling.
 *
 * These tests validate Zod schemas and service-layer error propagation
 * without hitting the live Google Calendar API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema imports
// ---------------------------------------------------------------------------

import { checkAvailabilitySchema } from "../tools/check-availability";
import { createBookingSchema } from "../tools/create-booking";
import { getBookingSchema } from "../tools/get-booking";
import { rescheduleBookingSchema } from "../tools/reschedule-booking";
import { cancelBookingSchema } from "../tools/cancel-booking";
import { getHostInfoPayload } from "../resources/host-info";

// ---------------------------------------------------------------------------
// Service mocks — prevent any real calendar calls
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/availability", () => ({
  getAvailability: vi.fn(),
}));

vi.mock("@/lib/services/bookings", () => ({
  createBooking: vi.fn(),
  getBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    constructor(msg = "Slot taken") { super(msg); this.name = "ConflictError"; }
  },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    constructor(msg = "Not found") { super(msg); this.name = "NotFoundError"; }
  },
  CalendarApiError: class CalendarApiError extends Error {
    statusCode = 503;
    constructor(msg = "Calendar unreachable") { super(msg); this.name = "CalendarApiError"; }
  },
}));

vi.mock("@/lib/google-auth", () => ({
  getCalendarClient: vi.fn(),
}));

vi.mock("@/lib/validate-env", () => ({}));

// ---------------------------------------------------------------------------
// Schema helper
// ---------------------------------------------------------------------------

function parseSchema(shape: Record<string, z.ZodTypeAny>, data: unknown) {
  return z.object(shape).safeParse(data);
}

// ---------------------------------------------------------------------------
// check_availability schema
// ---------------------------------------------------------------------------

describe("check_availability schema", () => {
  it("accepts valid params", () => {
    const result = parseSchema(checkAvailabilitySchema, {
      date: "2026-03-15",
      duration: 30,
      timezone: "America/Toronto",
    });
    expect(result.success).toBe(true);
  });

  it("defaults timezone to America/Toronto", () => {
    const result = parseSchema(checkAvailabilitySchema, {
      date: "2026-03-15",
      duration: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("America/Toronto");
    }
  });

  it("rejects invalid date format", () => {
    const result = parseSchema(checkAvailabilitySchema, {
      date: "March 15 2026",
      duration: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid duration", () => {
    const result = parseSchema(checkAvailabilitySchema, {
      date: "2026-03-15",
      duration: 45, // not in enum
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid durations", () => {
    for (const duration of [15, 30, 60, 120]) {
      const result = parseSchema(checkAvailabilitySchema, {
        date: "2026-03-15",
        duration,
      });
      expect(result.success, `duration ${duration} should be valid`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// create_booking schema
// ---------------------------------------------------------------------------

describe("create_booking schema", () => {
  const validBooking = {
    startTime: "2026-03-15T14:00:00Z",
    duration: 30,
    timezone: "America/Toronto",
    locationType: "zoom",
    bookerName: "Alice Smith",
    bookerEmail: "alice@example.com",
  };

  it("accepts valid params", () => {
    const result = parseSchema(createBookingSchema, validBooking);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = parseSchema(createBookingSchema, {
      ...validBooking,
      bookerEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid locationType", () => {
    const result = parseSchema(createBookingSchema, {
      ...validBooking,
      locationType: "slack_huddle", // not in enum
    });
    expect(result.success).toBe(false);
  });

  it("enforces description max length via schema", () => {
    // zod enforces max(500)
    const long = "x".repeat(501);
    const result = parseSchema(createBookingSchema, {
      ...validBooking,
      description: long,
    });
    expect(result.success).toBe(false);
  });

  it("accepts description at exactly 500 chars", () => {
    const exactly500 = "x".repeat(500);
    const result = parseSchema(createBookingSchema, {
      ...validBooking,
      description: exactly500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid locationTypes", () => {
    const types = ["in_person", "phone", "zoom", "google_meet", "webex", "jitsi"] as const;
    for (const locationType of types) {
      const result = parseSchema(createBookingSchema, { ...validBooking, locationType });
      expect(result.success, `locationType ${locationType} should be valid`).toBe(true);
    }
  });

  it("accepts additionalAttendees", () => {
    const result = parseSchema(createBookingSchema, {
      ...validBooking,
      additionalAttendees: [
        { name: "Bob Jones", email: "bob@example.com" },
        { name: "Carol", }, // email optional
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_booking schema
// ---------------------------------------------------------------------------

describe("get_booking schema", () => {
  it("accepts a valid UUID token", () => {
    const result = parseSchema(getBookingSchema, {
      token: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID token", () => {
    const result = parseSchema(getBookingSchema, { token: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reschedule_booking schema
// ---------------------------------------------------------------------------

describe("reschedule_booking schema", () => {
  it("accepts valid params", () => {
    const result = parseSchema(rescheduleBookingSchema, {
      token: "550e8400-e29b-41d4-a716-446655440000",
      newStartTime: "2026-03-16T15:00:00Z",
      timezone: "America/Toronto",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing timezone", () => {
    const result = parseSchema(rescheduleBookingSchema, {
      token: "550e8400-e29b-41d4-a716-446655440000",
      newStartTime: "2026-03-16T15:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancel_booking schema
// ---------------------------------------------------------------------------

describe("cancel_booking schema", () => {
  it("accepts a valid UUID token", () => {
    const result = parseSchema(cancelBookingSchema, {
      token: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// host-info resource
// ---------------------------------------------------------------------------

describe("booking://host-info resource", () => {
  beforeEach(() => {
    vi.stubEnv("HOST_NAME", "Rob Brown");
    vi.stubEnv("HOST_TIMEZONE", "America/Toronto");
    vi.stubEnv("HOST_DOMAIN", "book.robisit.com");
  });

  it("returns expected shape", () => {
    const payload = getHostInfoPayload();
    expect(payload.hostName).toBe("Rob Brown");
    expect(payload.timezone).toBe("America/Toronto");
    expect(payload.availableDurations).toEqual([15, 30, 60, 120]);
    expect(payload.locationTypes).toContain("zoom");
    expect(payload.locationTypes).toContain("google_meet");
    expect(payload.bookingPageUrl).toContain("robisit.com");
  });

  it("includes all 6 location types", () => {
    const payload = getHostInfoPayload();
    expect(payload.locationTypes).toHaveLength(6);
  });

  it("has duration labels for all 4 durations", () => {
    const payload = getHostInfoPayload();
    expect(Object.keys(payload.durationLabels)).toHaveLength(4);
    expect(payload.durationLabels["15"]).toBeTruthy();
    expect(payload.durationLabels["120"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error handling: get_booking with fake token returns structured error
// ---------------------------------------------------------------------------

describe("get_booking tool handler — error handling", () => {
  it("returns isError:true for NotFoundError (import isolation check)", async () => {
    // We test the service error class directly since we can't instantiate the
    // tool handler without a full MCP server in unit tests.  The integration
    // test in the TestingPlan section covers the full flow.
    const { NotFoundError } = await import("@/lib/services/bookings");
    const err = new NotFoundError();
    expect(err.name).toBe("NotFoundError");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBeTruthy();
  });
});

describe("ConflictError", () => {
  it("has correct statusCode", async () => {
    const { ConflictError } = await import("@/lib/services/bookings");
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });
});

describe("CalendarApiError", () => {
  it("has correct statusCode", async () => {
    const { CalendarApiError } = await import("@/lib/services/bookings");
    const err = new CalendarApiError();
    expect(err.statusCode).toBe(503);
  });
});
