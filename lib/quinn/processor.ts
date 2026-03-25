/**
 * Quinn processor pipeline — D-01, D-02
 *
 * Orchestrates the full message-processing pipeline:
 *   1. Extract body (trust module)
 *   2. Parse intent (Claude NLU)
 *   3. Resolve defaults (date/duration/timezone)
 *   4. Dispatch to the appropriate service action
 *   5. Emit PostHog observability events
 *   6. Capture exceptions via Sentry
 *
 * processMessage() never throws — all errors are caught and returned as
 * ActionResult { type: "error" }.
 */

import * as Sentry from "@sentry/nextjs";
import { google } from "googleapis";

import { extractBody, getHeader, extractEmail } from "@/lib/quinn/trust";
import { parseIntent } from "@/lib/quinn/parser";
import { resolveDefaults } from "@/lib/quinn/defaults";
import { getPostHogClient } from "@/lib/posthog-server";
import { getGoogleAuth } from "@/lib/google-auth";
import {
  getAvailability,
} from "@/lib/services/availability";
import {
  createBooking,
  getBooking,
  rescheduleBooking,
  cancelBooking,
  ConflictError,
  NotFoundError,
} from "@/lib/services/bookings";
import type { GmailMessage } from "@/lib/quinn/poller";
import type {
  Intent,
  BookIntent,
  RescheduleIntent,
  CancelIntent,
  CheckAvailabilityIntent,
} from "@/lib/quinn/intent";
import { fromZonedTime } from "date-fns-tz";

// ---------------------------------------------------------------------------
// Quinn's own Gmail address — excluded from attendee lists (D-04)
// ---------------------------------------------------------------------------

const QUINN_EMAIL = (process.env.GMAIL_USER ?? "").toLowerCase();

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface BookingAttendee {
  name: string;
  email: string;
}

export interface BookingDetails {
  attendees: BookingAttendee[];
  locationType: string;
  locationDetails: string;
  timezone: string;
  icsContent: string;
}

export type ActionResult =
  | {
      type: "booked";
      token: string;
      startTime: string;
      duration: number;
      substituted?: { requested: string; booked: string };
      differentDate?: { requested: string; booked: string };
      bookingDetails?: BookingDetails;
    }
  | {
      type: "availability_listed";
      slots: string[];
      date: string;
      duration: number;
      timezone: string;
    }
  | { type: "rescheduled"; token: string; newStartTime: string }
  | { type: "cancelled"; token: string }
  | { type: "clarification_needed"; reason: string }
  | { type: "error"; userMessage: string };

export interface ProcessResult {
  messageId: string;
  success: boolean;
  intent: Intent;
  actionResult: ActionResult;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Observability helper — D-26
// Wraps PostHog capture in try/catch so observability never crashes pipeline
// ---------------------------------------------------------------------------

function logQuinnEvent(
  event: string,
  properties: Record<string, unknown>
): void {
  try {
    getPostHogClient().capture({ distinctId: "quinn-system", event, properties });
  } catch {
    // Intentionally silenced — observability must never crash the pipeline
  }
}

// ---------------------------------------------------------------------------
// parseAddressList — D-04
//
// Splits an RFC 5322 address-list header value into name+email pairs.
// Simple implementation: split on commas that are not inside angle brackets.
// ---------------------------------------------------------------------------

export function parseAddressList(
  header: string
): Array<{ name: string; email: string }> {
  // Split on commas that are not inside angle brackets.
  // Simple approach: split on ", " where there's no unmatched "<" preceding it.
  // We iterate manually to avoid regex lookbehind complexity.
  const entries: string[] = [];
  let current = "";
  let inBracket = false;

  for (const ch of header) {
    if (ch === "<") {
      inBracket = true;
      current += ch;
    } else if (ch === ">") {
      inBracket = false;
      current += ch;
    } else if (ch === "," && !inBracket) {
      entries.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    entries.push(current.trim());
  }

  return entries
    .map((entry) => {
      const angleMatch = entry.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
      if (angleMatch) {
        return {
          name: angleMatch[1].trim().replace(/^"|"$/g, ""),
          email: angleMatch[2].trim().toLowerCase(),
        };
      }
      // Bare email address
      if (entry.includes("@")) {
        return { name: "", email: entry.trim().toLowerCase() };
      }
      return null;
    })
    .filter((e): e is { name: string; email: string } => {
      return e !== null && e.email.includes("@");
    });
}

// ---------------------------------------------------------------------------
// findClosestSlot
//
// Returns the slot with minimum absolute time distance from requestedHHMM.
// Returns null if the slots array is empty.
// ---------------------------------------------------------------------------

export function findClosestSlot(
  slots: string[],
  requestedHHMM: string
): string | null {
  if (slots.length === 0) return null;

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const targetMinutes = toMinutes(requestedHHMM);

  let closest = slots[0];
  let minDistance = Math.abs(toMinutes(slots[0]) - targetMinutes);

  for (let i = 1; i < slots.length; i++) {
    const dist = Math.abs(toMinutes(slots[i]) - targetMinutes);
    if (dist < minDistance) {
      minDistance = dist;
      closest = slots[i];
    }
  }

  return closest;
}

// ---------------------------------------------------------------------------
// extractTokenFromThread — D-08, D-09
//
// Fetches the full Gmail thread and searches all message bodies + snippets
// for a /bookings/<UUID> pattern. Returns the first match or null.
// ---------------------------------------------------------------------------

export async function extractTokenFromThread(
  threadId: string
): Promise<string | null> {
  const TOKEN_REGEX =
    /\/(?:manage|bookings)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

  const gmail = google.gmail({ version: "v1", auth: getGoogleAuth() });
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = res.data.messages ?? [];

  for (const msg of messages) {
    // Check snippet first (fast path)
    if (msg.snippet) {
      const m = msg.snippet.match(TOKEN_REGEX);
      if (m) return m[1];
    }

    // Decode and check body
    const bodyData = msg.payload?.body?.data;
    if (bodyData) {
      const decoded = Buffer.from(bodyData, "base64url").toString("utf-8");
      const m = decoded.match(TOKEN_REGEX);
      if (m) return m[1];
    }

    // Check parts
    const parts = msg.payload?.parts ?? [];
    for (const part of parts) {
      const partData = part.body?.data;
      if (partData) {
        const decoded = Buffer.from(partData, "base64url").toString("utf-8");
        const m = decoded.match(TOKEN_REGEX);
        if (m) return m[1];
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// handleBook — D-03 through D-07, D-12
// ---------------------------------------------------------------------------

async function handleBook(
  intent: BookIntent,
  message: GmailMessage
): Promise<ActionResult> {
  const headers = message.payload.headers;

  // Extract sender info for booking
  const fromHeader = getHeader(headers, "From") ?? "";
  const fromEmail = extractEmail(fromHeader);

  // Parse sender name from From header
  const fromNameMatch = fromHeader.match(/^"?([^"<]*?)"?\s*<[^>]+>/);
  const fromName = fromNameMatch
    ? fromNameMatch[1].trim().replace(/^"|"$/g, "")
    : fromEmail;

  // Collect attendees from To and CC headers (D-04, D-05, D-06)
  const toHeader = getHeader(headers, "To") ?? "";
  const ccHeader = getHeader(headers, "CC") ?? getHeader(headers, "Cc") ?? "";
  const headerAttendees = [
    ...parseAddressList(toHeader),
    ...parseAddressList(ccHeader),
  ];

  // Deduplicate header attendees by email, excluding Quinn and sender
  const seenEmails = new Set<string>([QUINN_EMAIL, fromEmail]);
  const dedupedAttendees: Array<{ name: string; email: string }> = [];

  for (const att of headerAttendees) {
    if (!att.email || seenEmails.has(att.email)) continue;
    seenEmails.add(att.email);
    dedupedAttendees.push({ name: att.name, email: att.email });
  }

  // Merge intent names with header attendees (D-07)
  // Intent may provide display names (e.g. "Steve") for people already in
  // To/CC as email-only entries. Match intent names to attendees missing a
  // display name; any leftover intent names are added without email.
  const intentNames = [...(intent.attendeeNames ?? [])];
  for (const att of dedupedAttendees) {
    if (att.name && att.name !== att.email) continue; // already has a real display name
    const idx = intentNames.findIndex((n) => n.length > 0);
    if (idx !== -1) {
      att.name = intentNames[idx];
      intentNames.splice(idx, 1);
    }
  }
  // Remaining intent names with no matching header email
  for (const name of intentNames) {
    if (name) dedupedAttendees.push({ name, email: "" });
  }

  // Derive date (YYYY-MM-DD) from requestedDate
  const requestedDate = intent.requestedDate ?? "";
  const date = requestedDate.slice(0, 10);
  const duration = intent.duration ?? 30;
  const timezone = intent.timezone ?? "America/Toronto";

  // Extract requested HH:MM from requestedDate (e.g. "2026-04-01T14:00:00.000Z")
  // Convert from UTC to local timezone to get the HH:MM for comparison
  let requestedHHMM = "";
  if (requestedDate.length > 10) {
    // Full datetime — extract time portion in the local timezone
    const requestedUtc = new Date(requestedDate);
    const localTimeStr = requestedUtc.toLocaleTimeString("en-CA", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    requestedHHMM = localTimeStr.slice(0, 5);
  }

  // Get availability for the requested date, then scan up to 14 days ahead
  // if no slots are found on the originally requested date.
  let searchDate = date;
  let availability = await getAvailability({ date: searchDate, duration, timezone });
  let differentDate: { requested: string; booked: string } | undefined;
  const MAX_DAYS_AHEAD = 14;

  if (availability.slots.length === 0) {
    for (let i = 1; i <= MAX_DAYS_AHEAD; i++) {
      const nextDate = new Date(date + "T12:00:00Z");
      nextDate.setUTCDate(nextDate.getUTCDate() + i);
      const nextDateStr = nextDate.toISOString().slice(0, 10);
      const nextAvail = await getAvailability({ date: nextDateStr, duration, timezone });
      if (nextAvail.slots.length > 0) {
        differentDate = { requested: date, booked: nextDateStr };
        searchDate = nextDateStr;
        availability = nextAvail;
        break;
      }
    }
  }

  if (availability.slots.length === 0) {
    return {
      type: "error",
      userMessage:
        "No available slots found in the next two weeks. Please try a later date.",
    };
  }

  // Determine which slot to use
  const isAvailable =
    !differentDate && requestedHHMM !== "" && availability.slots.includes(requestedHHMM);
  const selectedSlot = isAvailable
    ? requestedHHMM
    : findClosestSlot(availability.slots, requestedHHMM || "09:00");

  if (!selectedSlot) {
    return {
      type: "error",
      userMessage:
        "No available slots found for that date. Please try a different date.",
    };
  }

  // Build ISO startTime from searchDate + selectedSlot + timezone
  const [slotHour, slotMinute] = selectedSlot.split(":").map(Number);
  const localDateTimeStr = `${searchDate}T${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}:00`;
  const startTime = fromZonedTime(localDateTimeStr, timezone).toISOString();

  const bookingParams = {
    startTime,
    duration,
    timezone,
    locationType: "google-meet", // Default for Quinn bookings
    bookerName: fromName,
    bookerEmail: fromEmail,
    additionalAttendees: dedupedAttendees,
    skipEmails: true, // Quinn sends its own combined reply with ICS
  };

  // Build attendee list for the reply (booker + additional, no host)
  const attendeeList: BookingAttendee[] = [
    { name: fromName, email: fromEmail },
    ...dedupedAttendees.map((a) => ({ name: a.name, email: a.email ?? "" })),
  ];

  try {
    const result = await createBooking(bookingParams);
    const substituted =
      !differentDate && !isAvailable && requestedHHMM
        ? { requested: requestedHHMM, booked: selectedSlot }
        : undefined;

    return {
      type: "booked",
      token: result.token,
      startTime: result.startTime,
      duration: result.duration,
      ...(substituted ? { substituted } : {}),
      ...(differentDate ? { differentDate } : {}),
      bookingDetails: {
        attendees: attendeeList,
        locationType: result.locationType ?? bookingParams.locationType,
        locationDetails: result.locationDetails ?? "",
        timezone,
        icsContent: result.icsContent ?? "",
      },
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      // Closest-slot fallback (D-12): retry with next best available slot
      const fallbackSlot = findClosestSlot(
        availability.slots.filter((s) => s !== selectedSlot),
        requestedHHMM || "09:00"
      );

      if (!fallbackSlot) {
        return {
          type: "error",
          userMessage:
            "That time was just booked and no alternative slots are available. Please try a different date.",
        };
      }

      const [fbHour, fbMinute] = fallbackSlot.split(":").map(Number);
      const fbLocalStr = `${searchDate}T${String(fbHour).padStart(2, "0")}:${String(fbMinute).padStart(2, "0")}:00`;
      const fbStartTime = fromZonedTime(fbLocalStr, timezone).toISOString();

      try {
        const fallbackResult = await createBooking({
          ...bookingParams,
          startTime: fbStartTime,
        });

        return {
          type: "booked",
          token: fallbackResult.token,
          startTime: fallbackResult.startTime,
          duration: fallbackResult.duration,
          substituted: {
            requested: requestedHHMM || selectedSlot,
            booked: fallbackSlot,
          },
          ...(differentDate ? { differentDate } : {}),
          bookingDetails: {
            attendees: attendeeList,
            locationType: fallbackResult.locationType ?? bookingParams.locationType,
            locationDetails: fallbackResult.locationDetails ?? "",
            timezone,
            icsContent: fallbackResult.icsContent ?? "",
          },
        };
      } catch {
        return {
          type: "error",
          userMessage:
            "That time was just taken and the fallback slot was also unavailable. Please try a different date.",
        };
      }
    }

    throw err; // Re-throw non-ConflictErrors (caught by outer handler)
  }
}

// ---------------------------------------------------------------------------
// handleCheckAvailability
// ---------------------------------------------------------------------------

async function handleCheckAvailability(
  intent: CheckAvailabilityIntent
): Promise<ActionResult> {
  const date = (intent.requestedDate ?? "").slice(0, 10);
  const duration = intent.duration ?? 30;
  const timezone = intent.timezone ?? "America/Toronto";

  const result = await getAvailability({ date, duration, timezone });

  return {
    type: "availability_listed",
    slots: result.slots,
    date: result.date,
    duration: result.duration,
    timezone: result.timezone,
  };
}

// ---------------------------------------------------------------------------
// handleReschedule
// ---------------------------------------------------------------------------

async function handleReschedule(
  intent: RescheduleIntent,
  threadId: string,
  senderEmail: string
): Promise<ActionResult> {
  // Try bookingReference first, then fall back to thread extraction (D-10)
  let token: string | null = intent.bookingReference ?? null;
  if (!token) {
    token = await extractTokenFromThread(threadId);
  }

  if (!token) {
    return {
      type: "clarification_needed",
      reason:
        "I couldn't find the booking reference for this appointment. Could you share the booking link or token?",
    };
  }

  // Verify the sender owns this booking before modifying it
  try {
    const booking = await getBooking(token);
    if (booking.bookerEmail.toLowerCase() !== senderEmail.toLowerCase()) {
      return {
        type: "clarification_needed",
        reason:
          "I found a booking reference, but it doesn't appear to belong to you. Could you share your own booking link?",
      };
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        type: "error",
        userMessage: "I couldn't find that booking — it may have been cancelled or already passed.",
      };
    }
    throw err;
  }

  const result = await rescheduleBooking({
    token,
    newStartTime: intent.requestedDate ?? "",
    timezone: intent.timezone ?? "America/Toronto",
  });

  return {
    type: "rescheduled",
    token: result.token,
    newStartTime: result.startTime,
  };
}

// ---------------------------------------------------------------------------
// handleCancel
// ---------------------------------------------------------------------------

async function handleCancel(
  intent: CancelIntent,
  threadId: string,
  senderEmail: string
): Promise<ActionResult> {
  let token: string | null = intent.bookingReference ?? null;
  if (!token) {
    token = await extractTokenFromThread(threadId);
  }

  if (!token) {
    return {
      type: "clarification_needed",
      reason:
        "I couldn't find the booking reference for this appointment. Could you share the booking link or token?",
    };
  }

  // Verify the sender owns this booking before cancelling it
  try {
    const booking = await getBooking(token);
    if (booking.bookerEmail.toLowerCase() !== senderEmail.toLowerCase()) {
      return {
        type: "clarification_needed",
        reason:
          "I found a booking reference, but it doesn't appear to belong to you. Could you share your own booking link?",
      };
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        type: "error",
        userMessage: "I couldn't find that booking — it may have been cancelled or already passed.",
      };
    }
    throw err;
  }

  const result = await cancelBooking(token);

  return { type: "cancelled", token: result.token };
}

// ---------------------------------------------------------------------------
// processMessage — main entry point (D-01, D-02)
// ---------------------------------------------------------------------------

export async function processMessage(
  message: GmailMessage
): Promise<ProcessResult> {
  const startMs = Date.now();
  // Provide a placeholder intent for error cases where parsing didn't complete
  let resolvedIntent: Intent = {
    intent: "unknown",
    confidence: "low",
    rawDateText: null,
    assumptions: [],
    clarificationQuestion: "Processing error — see error result.",
  };

  try {
    // Step 1: Extract plain text body
    const body = extractBody(message.payload);

    // Step 2: Parse intent via Claude
    const rawIntent = await parseIntent(body);
    resolvedIntent = rawIntent;

    // Step 3: Resolve defaults (date, duration, timezone)
    resolvedIntent = resolveDefaults(rawIntent, new Date());

    // Step 4: PostHog — intent_parsed (D-26)
    logQuinnEvent("quinn:intent_parsed", {
      intent_type: resolvedIntent.intent,
      confidence: resolvedIntent.confidence,
      message_id: message.id,
    });

    // Step 5: Dispatch to action handler
    const senderEmail = extractEmail(
      getHeader(message.payload.headers, "From") ?? ""
    );
    let actionResult: ActionResult;

    switch (resolvedIntent.intent) {
      case "book":
        actionResult = await handleBook(resolvedIntent, message);
        break;
      case "check_availability":
        actionResult = await handleCheckAvailability(resolvedIntent);
        break;
      case "reschedule":
        actionResult = await handleReschedule(resolvedIntent, message.threadId, senderEmail);
        break;
      case "cancel":
        actionResult = await handleCancel(resolvedIntent, message.threadId, senderEmail);
        break;
      case "unknown":
        actionResult = {
          type: "clarification_needed",
          reason: resolvedIntent.clarificationQuestion,
        };
        break;
      default: {
        // TypeScript exhaustiveness guard
        const _exhaustive: never = resolvedIntent;
        void _exhaustive;
        actionResult = {
          type: "clarification_needed",
          reason: "I wasn't sure what you needed. Could you clarify?",
        };
      }
    }

    // Step 6: PostHog — action_taken (D-26)
    const durationMs = Date.now() - startMs;
    logQuinnEvent("quinn:action_taken", {
      intent_type: resolvedIntent.intent,
      action_result_type: actionResult.type,
      duration_ms: durationMs,
    });

    return {
      messageId: message.id,
      success: actionResult.type !== "error",
      intent: resolvedIntent,
      actionResult,
      durationMs,
    };
  } catch (err) {
    // D-02: outer catch — Sentry captures, returns structured error (D-17)
    Sentry.captureException(err);

    const durationMs = Date.now() - startMs;
    const userMessage =
      err instanceof Error
        ? `Something went wrong: ${err.message}`
        : "An unexpected error occurred while processing your request.";

    return {
      messageId: message.id,
      success: false,
      intent: resolvedIntent,
      actionResult: { type: "error", userMessage },
      durationMs,
    };
  }
}
