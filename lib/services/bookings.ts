/**
 * Booking service — importable functions shared by the API route and
 * MCP tool handlers.  No HTTP self-calls; all logic runs in-process.
 *
 * These functions mirror the business logic that previously lived inline
 * in app/api/bookings/route.ts and app/api/bookings/[token]/route.ts.
 * The original routes continue to work — they call the same calendar
 * client and helpers, just via their own handlers.
 */

import { addMinutes } from "date-fns";
import { getCalendarClient } from "@/lib/google-auth";
import { getBusyPeriods, getHostTimezone } from "@/lib/availability";
import { extractZoomMeetingId, updateZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { createMeetingLink } from "@/lib/services/meetings";
import {
  sendEmail,
  buildIcs,
  escapeHtml,
  formatDate,
  formatTime,
  formatOrdinalDateTime,
  formatLocationLine,
  formatSummaryText,
  formatSummaryHtml,
} from "@/lib/gmail";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MEETING_TYPE_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

const VALID_DURATIONS = [15, 30, 60, 120] as const;
export type ValidDuration = (typeof VALID_DURATIONS)[number];

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  throw lastError;
}

/** Find a calendar event by its management token. Returns null if not found. */
async function findEventByToken(
  calendar: ReturnType<typeof getCalendarClient>,
  token: string
) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const res = await calendar.events.list({
    calendarId,
    privateExtendedProperty: [`token=${token}`],
    singleEvents: true,
    maxResults: 1,
    // Include past events so users can still view/cancel them
    orderBy: "startTime",
  });
  return res.data.items?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

export interface AdditionalAttendee {
  name: string;
  email?: string;
}

export interface CreateBookingParams {
  startTime: string;           // ISO 8601 datetime string
  duration: number;            // minutes — one of 15, 30, 60, 120
  timezone: string;            // IANA timezone
  locationType: string;        // in_person | phone | zoom | google_meet | webex | jitsi
  locationDetails?: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone?: string;
  additionalAttendees?: AdditionalAttendee[];
  description?: string;        // max 500 chars
}

export interface CreateBookingResult {
  eventId: string;
  token: string;
  startTime: string;
  duration: number;
}

/** 409 class error when the slot is already taken */
export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message = "Sorry, that time was just taken! Please choose another slot.") {
    super(message);
    this.name = "ConflictError";
  }
}

/** 503 class error when the calendar API is unreachable */
export class CalendarApiError extends Error {
  readonly statusCode = 503;
  constructor(message = "We're having trouble reaching the calendar. Please try again in a moment.") {
    super(message);
    this.name = "CalendarApiError";
  }
}

/** 404 class error when a booking token cannot be found */
export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message = "Booking not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Map MCP tool locationType values to the calendar format used by the app.
 * The MCP spec uses underscores (in_person, google_meet); the internal app
 * uses hyphens (in-person, google-meet).  We normalize here so internal
 * helpers always receive the hyphenated form.
 */
function normalizeLocationType(raw: string): string {
  return raw.replace(/_/g, "-");
}

export async function createBooking(
  params: CreateBookingParams
): Promise<CreateBookingResult> {
  const {
    startTime,
    duration,
    timezone,
    bookerName,
    bookerEmail,
    bookerPhone = "",
    additionalAttendees = [],
    description = "",
  } = params;

  // Normalize so MCP callers (using underscores) match internal format
  const locationType = normalizeLocationType(params.locationType);

  // locationDetails may be auto-populated below, so we use let
  let locationDetails = params.locationDetails ?? "";

  if (!VALID_DURATIONS.includes(duration as ValidDuration)) {
    throw new Error(`Invalid duration. Must be one of: ${VALID_DURATIONS.join(", ")}.`);
  }

  // Cap description at 500 chars as per spec
  const safeDescription = description.slice(0, 500);

  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const start = new Date(startTime);
  const end = addMinutes(start, duration);

  // Auto-generate meeting link if not provided
  if (!locationDetails && ["zoom", "google-meet", "jitsi"].includes(locationType)) {
    locationDetails = await createMeetingLink(
      locationType as "zoom" | "google-meet" | "jitsi",
      start,
      duration,
      timezone
    );
  }

  // Re-query freebusy immediately to guard against race conditions
  const hostTimezone = await getHostTimezone(calendar);
  const busyPeriods = await getBusyPeriods(calendar, start, end, hostTimezone);
  const isConflict = busyPeriods.some(
    (busy) =>
      start.getTime() < busy.end.getTime() && end.getTime() > busy.start.getTime()
  );

  if (isConflict) {
    throw new ConflictError();
  }

  const token = crypto.randomUUID();
  const hostName = process.env.HOST_NAME ?? "Host";
  const hostDomain = process.env.HOST_DOMAIN ?? "";
  const meetingLabel = MEETING_TYPE_LABELS[locationType] ?? locationType;
  const eventTitle = `${bookerName} — ${duration} Min ${meetingLabel}`;

  const attendeeNames = [
    bookerName,
    ...additionalAttendees.map((a) => a.name).filter(Boolean),
    hostName,
  ].join(", ");

  const locationLine = formatLocationLine(locationType, locationDetails);
  const dateTimeLine = formatOrdinalDateTime(start, timezone);
  const manageUrl = hostDomain ? `${hostDomain}/manage/${token}` : "";

  const descParts: string[] = [
    attendeeNames,
    ...(safeDescription ? [safeDescription] : []),
    "",
    dateTimeLine,
    `${duration} minutes`,
    "",
    locationLine,
    ...(bookerPhone ? [`Backup phone ${bookerPhone}`] : []),
    "",
    `Booker email: ${bookerEmail}`,
    ...(manageUrl ? [`Manage: ${manageUrl}`] : []),
  ];
  const eventDescription = descParts.join("\n");

  const guests = [
    { email: bookerEmail, displayName: bookerName },
    ...additionalAttendees
      .filter((a) => a.email)
      .map((a) => ({ email: a.email!, displayName: a.name })),
  ];

  let event;
  try {
    event = await withRetry(() =>
      calendar.events.insert({
        calendarId,
        sendUpdates: "none", // confirmation emails handled separately
        requestBody: {
          summary: eventTitle,
          description: eventDescription,
          location: locationDetails || undefined,
          start: { dateTime: start.toISOString(), timeZone: timezone },
          end: { dateTime: end.toISOString(), timeZone: timezone },
          attendees: guests,
          extendedProperties: {
            private: {
              token,
              locationType,
              locationDetails,
              bookerName,
              bookerEmail,
              bookerPhone,
              duration: String(duration),
            },
          },
        },
      })
    );
  } catch {
    throw new CalendarApiError();
  }

  // Update Zoom meeting to the confirmed start time (non-fatal if it fails)
  if (locationType === "zoom" && locationDetails) {
    const meetingId = extractZoomMeetingId(locationDetails);
    if (meetingId) {
      updateZoomMeeting(meetingId, {
        startTime: start.toISOString(),
        duration,
        timezone,
      }).catch((err) => console.error("Failed to update Zoom meeting:", err));
    }
  }

  // Send confirmation email — same logic as /api/email/confirmation (non-fatal)
  const dateStr = formatDate(start, timezone);
  const startTimeStr = formatTime(start, timezone);
  const summaryOpts = {
    bookerName,
    additionalAttendees,
    description: safeDescription,
    startTime: start,
    duration,
    timezone,
    locationType,
    locationDetails,
    bookerPhone,
  };

  const emailText = [
    `Hi ${bookerName},`,
    ``,
    `You're all set. Here are the details for your meeting with ${hostName}.`,
    ``,
    formatSummaryText(summaryOpts),
    ``,
    `If anything comes up, you can cancel or reschedule here:`,
    manageUrl,
  ].join("\n");

  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">You're booked with ${hostName}</h1>
    <p style="margin:0 0 28px;color:#6B7280">Here are your meeting details.</p>
    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>
    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>
    <p style="margin:0 0 12px;color:#6B7280;font-size:14px">Need to change your plans?</p>
    <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Cancel or reschedule</a>
  </div>
</body>
</html>`;

  const allAttendees = [
    { name: bookerName, email: bookerEmail },
    ...additionalAttendees,
  ];
  const icsDescription = [
    `Meeting with ${hostName}`,
    `Date: ${dateStr}`,
    safeDescription ? `\nPurpose: ${safeDescription}` : "",
    additionalAttendees.length > 0
      ? `\nAttendees:\n${allAttendees.map((a) => `${a.name}${a.email ? ` <${a.email}>` : ""}`).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const icsContent = buildIcs({
    uid: token,
    startTime: start,
    duration,
    summary: `Meeting with ${hostName}`,
    description: icsDescription,
    location: locationLine,
    organizerEmail: process.env.GMAIL_USER!,
    attendeeEmail: bookerEmail,
    attendeeName: bookerName,
  });

  sendEmail({
    to: bookerEmail,
    subject: `You're booked with ${hostName} — ${dateStr} at ${startTimeStr}`,
    text: emailText,
    html: emailHtml,
    icsContent,
  }).catch((err) => console.error("Failed to send booking confirmation email:", err));

  // Host notification — same logic as /api/email/notification (non-fatal)
  const notificationSummaryOpts = {
    bookerName,
    additionalAttendees,
    description: safeDescription,
    startTime: start,
    duration,
    timezone,
    locationType,
    locationDetails,
  };
  const notificationText = [
    `New booking: ${bookerName}`,
    ``,
    formatSummaryText(notificationSummaryOpts),
    ``,
    `Booker email: ${bookerEmail}`,
  ].join("\n");
  const notificationHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">New booking: ${escapeHtml(bookerName)}</h1>
    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(notificationSummaryOpts)}
    </div>
    <p style="margin:16px 0 0;color:#6B7280;font-size:13px">Booker email: <a href="mailto:${escapeHtml(bookerEmail)}" style="color:#2563EB">${escapeHtml(bookerEmail)}</a></p>
  </div>
</body>
</html>`;
  sendEmail({
    to: process.env.GMAIL_USER!,
    subject: `New booking: ${bookerName} — ${dateStr}`,
    text: notificationText,
    html: notificationHtml,
  }).catch((err) => console.error("Failed to send host notification email:", err));

  return {
    eventId: event.data.id!,
    token,
    startTime: start.toISOString(),
    duration,
  };
}

// ---------------------------------------------------------------------------
// getBooking
// ---------------------------------------------------------------------------

export interface GetBookingResult {
  eventId: string;
  token: string;
  startTime: string;
  duration: number;
  locationType: string;
  locationDetails: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
}

export async function getBooking(token: string): Promise<GetBookingResult> {
  const calendar = getCalendarClient();
  const event = await findEventByToken(calendar, token);

  if (!event) {
    throw new NotFoundError();
  }

  const start = new Date(event.start!.dateTime!);
  const end = new Date(event.end!.dateTime!);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);
  const props = event.extendedProperties?.private ?? {};

  return {
    eventId: event.id!,
    token,
    startTime: start.toISOString(),
    duration,
    locationType: props.locationType ?? "",
    locationDetails: props.locationDetails ?? "",
    bookerName: props.bookerName ?? "",
    bookerEmail: props.bookerEmail ?? "",
    bookerPhone: props.bookerPhone ?? "",
  };
}

// ---------------------------------------------------------------------------
// rescheduleBooking
// ---------------------------------------------------------------------------

export interface RescheduleBookingParams {
  token: string;
  newStartTime: string;   // ISO 8601 datetime
  timezone: string;       // IANA timezone
}

export interface RescheduleBookingResult {
  eventId: string;
  token: string;
  startTime: string;
  duration: number;
}

export async function rescheduleBooking(
  params: RescheduleBookingParams
): Promise<RescheduleBookingResult> {
  const { token, newStartTime, timezone } = params;
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const event = await findEventByToken(calendar, token);
  if (!event) {
    throw new NotFoundError();
  }

  const oldStart = new Date(event.start!.dateTime!);
  const oldEnd = new Date(event.end!.dateTime!);
  const duration = Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000);

  const newStart = new Date(newStartTime);
  const newEnd = addMinutes(newStart, duration);

  const hostTimezone = await getHostTimezone(calendar);
  const busyPeriods = await getBusyPeriods(calendar, newStart, newEnd, hostTimezone);
  const isConflict = busyPeriods.some(
    (busy) =>
      newStart.getTime() < busy.end.getTime() &&
      newEnd.getTime() > busy.start.getTime()
  );

  if (isConflict) {
    throw new ConflictError();
  }

  try {
    await calendar.events.patch({
      calendarId,
      eventId: event.id!,
      sendUpdates: "none",
      requestBody: {
        start: { dateTime: newStart.toISOString(), timeZone: timezone },
        end: { dateTime: newEnd.toISOString(), timeZone: timezone },
      },
    });
  } catch {
    throw new CalendarApiError("We're having trouble rescheduling. Please try again.");
  }

  // Update Zoom meeting to the new time (non-fatal if it fails)
  const props = event.extendedProperties?.private ?? {};
  if (props.locationType === "zoom" && props.locationDetails) {
    const meetingId = extractZoomMeetingId(props.locationDetails);
    if (meetingId) {
      updateZoomMeeting(meetingId, {
        startTime: newStart.toISOString(),
        duration,
        timezone,
      }).catch((err) => console.error("Failed to update Zoom meeting on reschedule:", err));
    }
  }

  return {
    eventId: event.id!,
    token,
    startTime: newStart.toISOString(),
    duration,
  };
}

// ---------------------------------------------------------------------------
// cancelBooking
// ---------------------------------------------------------------------------

export interface CancelBookingResult {
  success: true;
  token: string;
}

export async function cancelBooking(token: string): Promise<CancelBookingResult> {
  const calendar = getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const event = await findEventByToken(calendar, token);
  if (!event) {
    throw new NotFoundError();
  }

  // Delete Zoom meeting if applicable (non-fatal if it fails)
  const props = event.extendedProperties?.private ?? {};
  if (props.locationType === "zoom" && props.locationDetails) {
    const meetingId = extractZoomMeetingId(props.locationDetails);
    if (meetingId) {
      deleteZoomMeeting(meetingId).catch((err) =>
        console.error("Failed to delete Zoom meeting on cancellation:", err)
      );
    }
  }

  try {
    await calendar.events.delete({
      calendarId,
      eventId: event.id!,
    });
  } catch {
    throw new CalendarApiError("We're having trouble cancelling. Please try again.");
  }

  return { success: true, token };
}
