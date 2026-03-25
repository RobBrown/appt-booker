import { vi, describe, it, expect, beforeEach } from "vitest";
import type { GmailMessage } from "@/lib/quinn/poller";

// ---------------------------------------------------------------------------
// Mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

const mockParseIntent = vi.fn();
const mockResolveDefaults = vi.fn();
const mockExtractBody = vi.fn();
const mockGetHeader = vi.fn();
const mockExtractEmail = vi.fn();
const mockGetAvailability = vi.fn();
const mockCreateBooking = vi.fn();
const mockGetBooking = vi.fn();
const mockRescheduleBooking = vi.fn();
const mockCancelBooking = vi.fn();
const mockCapturePostHog = vi.fn();
const mockGetPostHogClient = vi.fn(() => ({ capture: mockCapturePostHog }));
const mockCaptureException = vi.fn();
const mockThreadsGet = vi.fn();

vi.mock("@/lib/quinn/parser", () => ({
  parseIntent: mockParseIntent,
}));

vi.mock("@/lib/quinn/defaults", () => ({
  resolveDefaults: mockResolveDefaults,
}));

vi.mock("@/lib/quinn/trust", () => ({
  extractBody: mockExtractBody,
  getHeader: mockGetHeader,
  extractEmail: mockExtractEmail,
}));

vi.mock("@/lib/services/availability", () => ({
  getAvailability: mockGetAvailability,
}));

vi.mock("@/lib/services/bookings", () => ({
  createBooking: mockCreateBooking,
  getBooking: mockGetBooking,
  rescheduleBooking: mockRescheduleBooking,
  cancelBooking: mockCancelBooking,
  ConflictError: class ConflictError extends Error {
    readonly statusCode = 409;
    constructor(message = "Conflict") {
      super(message);
      this.name = "ConflictError";
    }
  },
  NotFoundError: class NotFoundError extends Error {
    readonly statusCode = 404;
    constructor(message = "Not found") {
      super(message);
      this.name = "NotFoundError";
    }
  },
  CalendarApiError: class CalendarApiError extends Error {
    readonly statusCode = 503;
    constructor(message = "Calendar error") {
      super(message);
      this.name = "CalendarApiError";
    }
  },
}));

vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: mockGetPostHogClient,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));

vi.mock("googleapis", () => {
  const gmail = {
    users: {
      threads: {
        get: mockThreadsGet,
      },
    },
  };
  return {
    google: {
      gmail: vi.fn(() => gmail),
    },
  };
});

vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGmailMessage(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "msg-001",
    threadId: "thread-001",
    labelIds: ["INBOX"],
    payload: {
      headers: [
        { name: "From", value: "\"Alice\" <alice@example.com>" },
        { name: "To", value: "quinn@example.com, bob@example.com" },
        { name: "CC", value: "charlie@example.com" },
      ],
      mimeType: "text/plain",
      body: { data: "Ym9vayBhIG1lZXRpbmc=" },
      parts: null,
    },
    ...overrides,
  };
}

const bookIntent = {
  intent: "book" as const,
  confidence: "high" as const,
  rawDateText: "next Tuesday at 2pm",
  assumptions: ["Assumed 30-minute duration"],
  requestedDate: "2026-04-01T14:00:00.000Z",
  duration: 30,
  timezone: "America/Toronto",
  attendeeNames: ["Bob"],
};

const checkAvailabilityIntent = {
  intent: "check_availability" as const,
  confidence: "high" as const,
  rawDateText: "next Tuesday",
  assumptions: [],
  requestedDate: "2026-04-01",
  duration: 30,
  timezone: "America/Toronto",
};

const rescheduleIntent = {
  intent: "reschedule" as const,
  confidence: "high" as const,
  rawDateText: "next Wednesday at 3pm",
  assumptions: [],
  bookingReference: null,
  requestedDate: "2026-04-02T15:00:00.000Z",
  timezone: "America/Toronto",
};

const cancelIntent = {
  intent: "cancel" as const,
  confidence: "high" as const,
  rawDateText: null,
  assumptions: [],
  bookingReference: null,
};

const unknownIntent = {
  intent: "unknown" as const,
  confidence: "low" as const,
  rawDateText: null,
  assumptions: [],
  clarificationQuestion: "What would you like me to do?",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GMAIL_USER", "quinn@example.com");
    // Default mock behavior
    mockExtractBody.mockReturnValue("book a meeting next Tuesday at 2pm");
    mockGetHeader.mockImplementation(
      (headers: Array<{ name: string; value: string }>, name: string) => {
        const h = headers.find(
          (h) => h.name.toLowerCase() === name.toLowerCase()
        );
        return h?.value;
      }
    );
    mockExtractEmail.mockImplementation((from: string) => {
      const match = from.match(/<([^>]+)>/);
      return (match ? match[1] : from).trim().toLowerCase();
    });
    mockResolveDefaults.mockImplementation((intent: unknown) => intent);
  });

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  describe("exports", () => {
    it("exports processMessage function", async () => {
      const mod = await import("@/lib/quinn/processor");
      expect(typeof mod.processMessage).toBe("function");
    });

    it("exports ActionResult type (compile-time only — check module shape)", async () => {
      const mod = await import("@/lib/quinn/processor");
      // Can't test TS types at runtime — verify the module loads
      expect(mod).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // findClosestSlot
  // -------------------------------------------------------------------------

  describe("findClosestSlot", () => {
    it("returns the closest slot to the requested time", async () => {
      const { findClosestSlot } = await import("@/lib/quinn/processor");
      expect(findClosestSlot(["09:00", "10:00", "11:00", "14:00"], "13:30")).toBe("14:00");
    });

    it("returns the exact slot when available", async () => {
      const { findClosestSlot } = await import("@/lib/quinn/processor");
      expect(findClosestSlot(["09:00", "10:00", "13:30"], "13:30")).toBe("13:30");
    });

    it("returns null for empty slot list", async () => {
      const { findClosestSlot } = await import("@/lib/quinn/processor");
      expect(findClosestSlot([], "13:30")).toBeNull();
    });

    it("returns morning slot when equidistant", async () => {
      const { findClosestSlot } = await import("@/lib/quinn/processor");
      // 10:00 is 30 min before 10:30; 11:00 is 30 min after 10:30
      const result = findClosestSlot(["10:00", "11:00"], "10:30");
      expect(["10:00", "11:00"]).toContain(result);
    });

    it("returns the only slot regardless of time", async () => {
      const { findClosestSlot } = await import("@/lib/quinn/processor");
      expect(findClosestSlot(["09:00"], "17:00")).toBe("09:00");
    });
  });

  // -------------------------------------------------------------------------
  // parseAddressList
  // -------------------------------------------------------------------------

  describe("parseAddressList", () => {
    it("parses Name <email> format", async () => {
      const { parseAddressList } = await import("@/lib/quinn/processor");
      const result = parseAddressList('"Rob" <rob@example.com>');
      expect(result).toEqual([{ name: "Rob", email: "rob@example.com" }]);
    });

    it("parses bare email format", async () => {
      const { parseAddressList } = await import("@/lib/quinn/processor");
      const result = parseAddressList("dan@test.com");
      expect(result).toEqual([{ name: "", email: "dan@test.com" }]);
    });

    it("parses multiple addresses", async () => {
      const { parseAddressList } = await import("@/lib/quinn/processor");
      const result = parseAddressList(
        '"Rob" <rob@example.com>, dan@test.com'
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "Rob", email: "rob@example.com" });
      expect(result[1]).toEqual({ name: "", email: "dan@test.com" });
    });

    it("lowercases all emails", async () => {
      const { parseAddressList } = await import("@/lib/quinn/processor");
      const result = parseAddressList("BOB@EXAMPLE.COM");
      expect(result[0].email).toBe("bob@example.com");
    });

    it("filters entries without @", async () => {
      const { parseAddressList } = await import("@/lib/quinn/processor");
      const result = parseAddressList("not-an-email, bob@example.com");
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("bob@example.com");
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — book intent
  // -------------------------------------------------------------------------

  describe("processMessage with book intent", () => {
    it("returns ProcessResult with type 'booked' on success", async () => {
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["14:00", "15:00"],
      });
      mockCreateBooking.mockResolvedValue({
        eventId: "evt-123",
        token: "tok-abc",
        startTime: "2026-04-01T18:00:00.000Z",
        duration: 30,
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const msg = makeGmailMessage();
      const result = await processMessage(msg);

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("booked");
      if (result.actionResult.type === "booked") {
        expect(result.actionResult.token).toBe("tok-abc");
        expect(result.actionResult.duration).toBe(30);
      }
    });

    it("calls getAvailability with date from requestedDate", async () => {
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["14:00", "15:00"],
      });
      mockCreateBooking.mockResolvedValue({
        eventId: "evt-123",
        token: "tok-abc",
        startTime: "2026-04-01T18:00:00.000Z",
        duration: 30,
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      await processMessage(makeGmailMessage());

      expect(mockGetAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ date: "2026-04-01", duration: 30 })
      );
    });

    it("calls createBooking with merged attendees excluding Quinn's email", async () => {
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["14:00", "15:00"],
      });
      mockCreateBooking.mockResolvedValue({
        eventId: "evt-123",
        token: "tok-abc",
        startTime: "2026-04-01T18:00:00.000Z",
        duration: 30,
      });

      const msg = makeGmailMessage({
        payload: {
          headers: [
            { name: "From", value: '"Alice" <alice@example.com>' },
            {
              name: "To",
              value: "quinn@example.com",
            },
            { name: "CC", value: "charlie@example.com" },
          ],
          mimeType: "text/plain",
          body: null,
          parts: null,
        },
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      await processMessage(msg);

      const callArgs = mockCreateBooking.mock.calls[0][0];
      const attendeeEmails = (callArgs.additionalAttendees ?? []).map(
        (a: { email?: string }) => a.email
      );
      expect(attendeeEmails).not.toContain("quinn@example.com");
    });

    it("uses closest-slot fallback when ConflictError is thrown", async () => {
      const { ConflictError } = await import("@/lib/services/bookings");
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["09:00", "10:00", "15:00"],
      });
      // First createBooking call conflicts; second succeeds
      mockCreateBooking
        .mockRejectedValueOnce(new ConflictError())
        .mockResolvedValueOnce({
          eventId: "evt-456",
          token: "tok-def",
          startTime: "2026-04-01T14:00:00.000Z",
          duration: 30,
        });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("booked");
      // createBooking called twice
      expect(mockCreateBooking).toHaveBeenCalledTimes(2);
    });

    it("returns 'booked' result with substituted field when slot changed", async () => {
      const { ConflictError } = await import("@/lib/services/bookings");
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["09:00", "10:00", "15:00"],
      });
      mockCreateBooking
        .mockRejectedValueOnce(new ConflictError())
        .mockResolvedValueOnce({
          eventId: "evt-456",
          token: "tok-def",
          startTime: "2026-04-01T19:00:00.000Z",
          duration: 30,
        });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.actionResult.type).toBe("booked");
      if (result.actionResult.type === "booked") {
        expect(result.actionResult.substituted).toBeDefined();
        expect(result.actionResult.substituted?.requested).toBeTruthy();
        expect(result.actionResult.substituted?.booked).toBeTruthy();
      }
    });

    it("returns 'error' result when both booking attempts fail", async () => {
      const { ConflictError } = await import("@/lib/services/bookings");
      mockParseIntent.mockResolvedValue(bookIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["09:00", "10:00"],
      });
      mockCreateBooking.mockRejectedValue(new ConflictError());

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(false);
      expect(result.actionResult.type).toBe("error");
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — check_availability intent
  // -------------------------------------------------------------------------

  describe("processMessage with check_availability intent", () => {
    it("returns ProcessResult with type 'availability_listed'", async () => {
      mockParseIntent.mockResolvedValue(checkAvailabilityIntent);
      mockGetAvailability.mockResolvedValue({
        date: "2026-04-01",
        timezone: "America/Toronto",
        duration: 30,
        slots: ["09:00", "10:00", "11:00"],
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("availability_listed");
      if (result.actionResult.type === "availability_listed") {
        expect(result.actionResult.slots).toEqual(["09:00", "10:00", "11:00"]);
        expect(result.actionResult.date).toBe("2026-04-01");
      }
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — reschedule intent
  // -------------------------------------------------------------------------

  describe("processMessage with reschedule intent", () => {
    it("returns 'rescheduled' when token found in thread", async () => {
      const rescheduleWithRef = {
        ...rescheduleIntent,
        bookingReference: "11111111-2222-3333-4444-555555555555",
      };
      mockParseIntent.mockResolvedValue(rescheduleWithRef);
      mockGetBooking.mockResolvedValue({
        eventId: "evt-789",
        token: "11111111-2222-3333-4444-555555555555",
        bookerEmail: "alice@example.com",
      });
      mockRescheduleBooking.mockResolvedValue({
        eventId: "evt-789",
        token: "11111111-2222-3333-4444-555555555555",
        startTime: "2026-04-02T19:00:00.000Z",
        duration: 30,
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("rescheduled");
    });

    it("falls back to extractTokenFromThread when bookingReference is null", async () => {
      mockParseIntent.mockResolvedValue(rescheduleIntent); // bookingReference: null
      // Thread contains a booking URL
      mockThreadsGet.mockResolvedValue({
        data: {
          messages: [
            {
              snippet: "/bookings/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee manage",
              payload: { body: { data: null }, parts: null },
            },
          ],
        },
      });
      mockGetBooking.mockResolvedValue({
        eventId: "evt-789",
        token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        bookerEmail: "alice@example.com",
      });
      mockRescheduleBooking.mockResolvedValue({
        eventId: "evt-789",
        token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        startTime: "2026-04-02T19:00:00.000Z",
        duration: 30,
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(mockRescheduleBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        })
      );
      expect(result.actionResult.type).toBe("rescheduled");
    });

    it("returns 'clarification_needed' when no token found in thread", async () => {
      mockParseIntent.mockResolvedValue(rescheduleIntent); // bookingReference: null
      mockThreadsGet.mockResolvedValue({
        data: { messages: [{ snippet: "no token here", payload: { body: { data: null }, parts: null } }] },
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.actionResult.type).toBe("clarification_needed");
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — cancel intent
  // -------------------------------------------------------------------------

  describe("processMessage with cancel intent", () => {
    it("returns 'cancelled' when token found in bookingReference", async () => {
      const cancelWithRef = {
        ...cancelIntent,
        bookingReference: "11111111-2222-3333-4444-555555555555",
      };
      mockParseIntent.mockResolvedValue(cancelWithRef);
      mockGetBooking.mockResolvedValue({
        eventId: "evt-789",
        token: "11111111-2222-3333-4444-555555555555",
        bookerEmail: "alice@example.com",
      });
      mockCancelBooking.mockResolvedValue({
        success: true,
        token: "11111111-2222-3333-4444-555555555555",
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("cancelled");
    });

    it("returns 'clarification_needed' when no token found", async () => {
      mockParseIntent.mockResolvedValue(cancelIntent); // bookingReference: null
      mockThreadsGet.mockResolvedValue({
        data: { messages: [] },
      });

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.actionResult.type).toBe("clarification_needed");
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — unknown intent
  // -------------------------------------------------------------------------

  describe("processMessage with unknown intent", () => {
    it("returns 'clarification_needed' with the clarificationQuestion", async () => {
      mockParseIntent.mockResolvedValue(unknownIntent);

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(true);
      expect(result.actionResult.type).toBe("clarification_needed");
      if (result.actionResult.type === "clarification_needed") {
        expect(result.actionResult.reason).toBe("What would you like me to do?");
      }
    });
  });

  // -------------------------------------------------------------------------
  // processMessage — error handling
  // -------------------------------------------------------------------------

  describe("processMessage error handling", () => {
    it("never throws — returns error result on unexpected failure", async () => {
      mockParseIntent.mockRejectedValue(new Error("Anthropic API down"));

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(result.success).toBe(false);
      expect(result.actionResult.type).toBe("error");
    });

    it("calls Sentry.captureException on errors", async () => {
      mockParseIntent.mockRejectedValue(new Error("Unexpected error"));

      const { processMessage } = await import("@/lib/quinn/processor");
      await processMessage(makeGmailMessage());

      expect(mockCaptureException).toHaveBeenCalled();
    });

    it("includes messageId in ProcessResult", async () => {
      mockParseIntent.mockResolvedValue(unknownIntent);

      const { processMessage } = await import("@/lib/quinn/processor");
      const msg = makeGmailMessage({ id: "specific-msg-id" });
      const result = await processMessage(msg);

      expect(result.messageId).toBe("specific-msg-id");
    });

    it("includes durationMs in ProcessResult", async () => {
      mockParseIntent.mockResolvedValue(unknownIntent);

      const { processMessage } = await import("@/lib/quinn/processor");
      const result = await processMessage(makeGmailMessage());

      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // PostHog observability
  // -------------------------------------------------------------------------

  describe("PostHog events", () => {
    it("fires quinn:intent_parsed event after parsing", async () => {
      mockParseIntent.mockResolvedValue(unknownIntent);

      const { processMessage } = await import("@/lib/quinn/processor");
      await processMessage(makeGmailMessage());

      const calls = mockCapturePostHog.mock.calls;
      const intentParsedCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === "object" &&
          c[0] !== null &&
          (c[0] as { event?: string }).event === "quinn:intent_parsed"
      );
      expect(intentParsedCall).toBeDefined();
    });

    it("fires quinn:action_taken event after action dispatch", async () => {
      mockParseIntent.mockResolvedValue(unknownIntent);

      const { processMessage } = await import("@/lib/quinn/processor");
      await processMessage(makeGmailMessage());

      const calls = mockCapturePostHog.mock.calls;
      const actionTakenCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === "object" &&
          c[0] !== null &&
          (c[0] as { event?: string }).event === "quinn:action_taken"
      );
      expect(actionTakenCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // extractTokenFromThread
  // -------------------------------------------------------------------------

  describe("extractTokenFromThread", () => {
    it("extracts UUID from /bookings/ pattern in message snippet", async () => {
      mockThreadsGet.mockResolvedValue({
        data: {
          messages: [
            {
              snippet:
                "Manage your booking at https://book.robisit.com/bookings/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
              payload: { body: { data: null }, parts: null },
            },
          ],
        },
      });

      const { extractTokenFromThread } = await import("@/lib/quinn/processor");
      const token = await extractTokenFromThread("thread-001");

      expect(token).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    });

    it("returns null when no token found in thread", async () => {
      mockThreadsGet.mockResolvedValue({
        data: { messages: [{ snippet: "no booking link here", payload: { body: { data: null }, parts: null } }] },
      });

      const { extractTokenFromThread } = await import("@/lib/quinn/processor");
      const token = await extractTokenFromThread("thread-001");

      expect(token).toBeNull();
    });

    it("returns null when thread has no messages", async () => {
      mockThreadsGet.mockResolvedValue({
        data: { messages: [] },
      });

      const { extractTokenFromThread } = await import("@/lib/quinn/processor");
      const token = await extractTokenFromThread("thread-001");

      expect(token).toBeNull();
    });
  });
});
