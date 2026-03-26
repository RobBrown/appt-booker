/**
 * Quinn reply composer — D-18, D-19, D-20, D-21, D-22
 *
 * Composes warm, first-person reply text from a structured ActionResult.
 * No external dependencies — pure template logic.
 * Signs every reply as "Quinn".
 *
 * Booking replies return both plain-text and HTML so the mailer can send
 * multipart/alternative with a clickable "Who is Quinn?" link.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { Intent } from "@/lib/quinn/intent";
import type { ActionResult } from "@/lib/quinn/processor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOST_URL = "https://book.robisit.com";

function getHostUrl(): string {
  return process.env.HOST_URL ?? DEFAULT_HOST_URL;
}

// ---------------------------------------------------------------------------
// Result type — plain text + optional HTML
// ---------------------------------------------------------------------------

export interface ComposeResult {
  text: string;
  html?: string;
}

// ---------------------------------------------------------------------------
// Time formatting helper — always 12h format (D-22)
// ---------------------------------------------------------------------------

function formatTime12h(isoUtc: string, timezone: string): string {
  return formatInTimeZone(
    new Date(isoUtc),
    timezone,
    "h:mm a 'on' EEEE, MMMM d"
  );
}

// ---------------------------------------------------------------------------
// Format a plain HH:MM slot string (e.g. "14:30") to 12h for availability listings
// ---------------------------------------------------------------------------

function formatSlot12h(hhMM: string): string {
  const [hourStr, minuteStr] = hhMM.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  return `${h12}:${mm} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Assumptions block — D-20
// Only rendered when there are assumptions.
// ---------------------------------------------------------------------------

// Assumptions are no longer included in email replies — logged server-side only.
function assumptionsBlock(): string {
  return "";
}

function assumptionsBlockHtml(): string {
  return "";
}

// ---------------------------------------------------------------------------
// Location labels
// ---------------------------------------------------------------------------

const LOCATION_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

// ---------------------------------------------------------------------------
// Date formatting for meeting details
// ---------------------------------------------------------------------------

function formatDateLong(isoUtc: string, timezone: string): string {
  return formatInTimeZone(new Date(isoUtc), timezone, "EEEE, MMMM d, yyyy");
}

function formatTimeTz(isoUtc: string, timezone: string): string {
  return formatInTimeZone(new Date(isoUtc), timezone, "h:mm a zzz");
}

// ---------------------------------------------------------------------------
// Attendee formatting
// ---------------------------------------------------------------------------

function formatAttendee(a: { name: string; email: string }): string {
  if (a.name && a.email && a.name !== a.email) return `${a.name}, ${a.email}`;
  return a.name || a.email;
}

// ---------------------------------------------------------------------------
// HTML helper — escape user-provided strings
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Booked reply
// ---------------------------------------------------------------------------

function composeBookedReply(
  intent: Intent,
  result: Extract<ActionResult, { type: "booked" }>,
  timezone: string
): ComposeResult {
  const hostUrl = getHostUrl();
  const formattedTime = formatTime12h(result.startTime, timezone);
  const managementLink = `${hostUrl}/manage/${result.token}`;
  const quinnLink = `${hostUrl}/?about=quinn`;

  // 1-sentence summary
  const summary = `All set — I've booked a ${result.duration}-minute meeting for ${formattedTime}.`;

  // Substitution / different-date notes
  let substitutionNote = "";
  if (result.differentDate) {
    substitutionNote =
      `There were no available slots on ${result.differentDate.requested}, ` +
      `so I booked the next available time instead.`;
  } else if (result.substituted) {
    substitutionNote =
      `That exact time was taken, so I booked the closest available slot instead — ` +
      `${result.substituted.requested} was unavailable, booked ${result.substituted.booked}.`;
  }

  // -- Plain text version --------------------------------------------------

  const textParts: string[] = [summary];

  if (substitutionNote) textParts.push("", substitutionNote);

  if (result.bookingDetails) {
    const d = result.bookingDetails;
    const tz = d.timezone || timezone;
    const locationLabel = LOCATION_LABELS[d.locationType] ?? d.locationType;

    textParts.push(
      "",
      "Attendees:",
      ...d.attendees.map((a) => formatAttendee(a)),
      "",
      "Date & Time:",
      formatDateLong(result.startTime, tz),
      formatTimeTz(result.startTime, tz),
      "",
      "Duration:",
      `${result.duration} minutes`,
      "",
      "Location:",
      locationLabel,
      ...(d.locationDetails ? [d.locationDetails] : []),
    );
  }

  textParts.push(
    "",
    "Please don't forget to accept the calendar invitation.",
  );

  const assumptions = assumptionsBlock();
  if (assumptions) textParts.push(assumptions);

  textParts.push(
    "",
    "If another day or time would work better, please let me know, or adjust the meeting here:",
    managementLink,
    "",
    "Quinn",
    `(Who is Quinn? ${quinnLink})`,
  );

  const text = textParts.join("\n");

  // -- HTML version --------------------------------------------------------

  const htmlParts: string[] = [
    `${esc(summary)}`,
  ];

  if (substitutionNote) htmlParts.push(`<br><br>${esc(substitutionNote)}`);

  if (result.bookingDetails) {
    const d = result.bookingDetails;
    const tz = d.timezone || timezone;
    const locationLabel = LOCATION_LABELS[d.locationType] ?? d.locationType;

    const attendeeHtml = d.attendees
      .map((a) => esc(formatAttendee(a)))
      .join("<br>");

    htmlParts.push(
      `<br><br><b>Attendees:</b><br>${attendeeHtml}`,
      `<br><br><b>Date &amp; Time:</b><br>${esc(formatDateLong(result.startTime, tz))}<br>${esc(formatTimeTz(result.startTime, tz))}`,
      `<br><br><b>Duration:</b><br>${result.duration} minutes`,
      `<br><br><b>Location:</b><br>${esc(locationLabel)}`,
    );
    if (d.locationDetails) {
      const details = d.locationDetails;
      const isUrl = details.startsWith("https://") || details.startsWith("http://");
      htmlParts.push(
        isUrl
          ? `<br><a href="${esc(details)}">${esc(details)}</a>`
          : `<br>${esc(details)}`
      );
    }
  }

  htmlParts.push(
    `<br><br>Please don&#39;t forget to accept the calendar invitation.`,
  );

  const assumptionsHtml = assumptionsBlockHtml();
  if (assumptionsHtml) htmlParts.push(assumptionsHtml);

  htmlParts.push(
    `<br><br>If another day or time would work better, please let me know, or adjust the meeting here:<br><a href="${esc(managementLink)}">${esc(managementLink)}</a>`,
    `<br><br>Quinn<br>(<a href="${esc(quinnLink)}">Who is Quinn?</a>)`,
  );

  const html = htmlParts.join("");

  return { text, html };
}

// ---------------------------------------------------------------------------
// Other reply composers (plain text only)
// ---------------------------------------------------------------------------

function composeAvailabilityReply(
  intent: Intent,
  result: Extract<ActionResult, { type: "availability_listed" }>
): ComposeResult {
  const assumptions = assumptionsBlock();

  if (result.slots.length === 0) {
    return {
      text:
        `There are no available slots for ${result.date} (${result.duration} minutes).` +
        assumptions +
        `\n\nQuinn`,
    };
  }

  const slotList = result.slots
    .map((s) => `- ${formatSlot12h(s)}`)
    .join("\n");

  return {
    text:
      `Here are the available slots for ${result.date} (${result.duration} minutes):\n\n` +
      slotList +
      assumptions +
      `\n\nQuinn`,
  };
}

function composeRescheduledReply(
  intent: Intent,
  result: Extract<ActionResult, { type: "rescheduled" }>,
  timezone: string
): ComposeResult {
  const hostUrl = getHostUrl();
  const formattedTime = formatTime12h(result.newStartTime, timezone);
  const managementLink = `${hostUrl}/manage/${result.token}`;
  const assumptions = assumptionsBlock();

  return {
    text:
      `Done — I've moved your booking to ${formattedTime}.` +
      assumptions +
      `\n\nManage or cancel: ${managementLink}\n\nQuinn`,
  };
}

function composeCancelledReply(): ComposeResult {
  return { text: `Done — your booking has been cancelled.\n\nQuinn` };
}

function composeClarificationReply(
  result: Extract<ActionResult, { type: "clarification_needed" }>
): ComposeResult {
  return {
    text:
      `${result.reason}\n\n` +
      `Just so you know, I can:\n` +
      `- Book a meeting\n` +
      `- Check availability\n` +
      `- Reschedule a booking\n` +
      `- Cancel a booking\n\nQuinn`,
  };
}

function composeErrorReply(
  result: Extract<ActionResult, { type: "error" }>
): ComposeResult {
  return { text: `I ran into a problem trying to do that. ${result.userMessage}\n\nQuinn` };
}

// ---------------------------------------------------------------------------
// Main export — D-18
// ---------------------------------------------------------------------------

/**
 * Compose a reply for Quinn to send in response to a processed message.
 *
 * @param intent   - The parsed intent (for assumptions and context)
 * @param result   - The ActionResult from the processor pipeline
 * @param opts     - { timezone } — IANA timezone string for time formatting
 * @returns ComposeResult with plain-text and optional HTML
 */
export function composeReply(
  intent: Intent,
  result: ActionResult,
  opts: { timezone: string }
): ComposeResult {
  const { timezone } = opts;

  switch (result.type) {
    case "booked":
      return composeBookedReply(intent, result, timezone);
    case "availability_listed":
      return composeAvailabilityReply(intent, result);
    case "rescheduled":
      return composeRescheduledReply(intent, result, timezone);
    case "cancelled":
      return composeCancelledReply();
    case "clarification_needed":
      return composeClarificationReply(result);
    case "error":
      return composeErrorReply(result);
    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = result;
      void _exhaustive;
      return { text: `Something unexpected happened.\n\nQuinn` };
    }
  }
}
