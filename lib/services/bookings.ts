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
import { logger, withSpan } from "@robbrown/observability-core";

const log = logger.child({ service: "bookings" });
import { getCalendarClient } from "@/lib/google-auth";
import { getBusyPeriods, getHostTimezone } from "@/lib/availability";
import { extractZoomMeetingId, updateZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { createMeetingLink } from "@/lib/services/meetings";
import {
  sendEmail,
  buildIcs,
  escapeHtml,
  firstNameOf,
  formatDateParts,
  formatTimeWithTz,
  formatDateTimeLine,
  formatLocationLine,
  formatLocationHtml,
  ordinalSuffix,
  renderEmailHtml,
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
  skipEmails?: boolean;        // true when Quinn sends its own combined reply
}

export interface CreateBookingResult {
  eventId: string;
  token: string;
  startTime: string;
  duration: number;
  /** Populated when skipEmails is true so the caller can attach to its own reply */
  icsContent?: string;
  locationDetails?: string;
  locationType?: string;
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
    skipEmails = false,
  } = params;

  // Normalize so MCP callers (using underscores) match internal format
  const locationType = normalizeLocationType(params.locationType);

  // locationDetails may be auto-populated below, so we use let
  let locationDetails = params.locationDetails ?? "";

  if (!VALID_DURATIONS.includes(duration as ValidDuration)) {
    throw new Error(`Invalid duration. Must be one of: ${VALID_DURATIONS.join(", ")}.`);
  }

  if (additionalAttendees.length > 20) {
    throw new Error("Too many attendees (max 20).");
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
  const calEventDateTimeLine = formatDateTimeLine(start, end, timezone);
  const manageUrl = hostDomain ? `${hostDomain}/manage/${token}` : "";

  const descParts: string[] = [
    attendeeNames,
    ...(safeDescription ? [safeDescription] : []),
    "",
    calEventDateTimeLine,
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
    event = await withSpan("calendar.events.insert", async () =>
      withRetry(() =>
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
                description: safeDescription,
                additionalAttendeesJson: JSON.stringify(additionalAttendees),
              },
            },
          },
        })
      ), { "calendar.operation": "insert", "booking.duration": duration }
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
      }).catch((err) => log.error("Failed to update Zoom meeting", { zoom_failure: true, error: String(err) }));
    }
  }

  // Build ICS (needed for both email and skipEmails return)
  const hostEmailAddr = process.env.GMAIL_USER!;
  const icsContent = buildIcs({
    uid: token,
    startTime: start,
    duration,
    summary: `Meeting with ${hostName}`,
    description: [
      `Meeting with ${hostName}`,
      ...(safeDescription ? [`Topic: ${safeDescription}`] : []),
    ].join("\n"),
    location: locationLine,
    organizerEmail: hostEmailAddr,
    attendeeEmail: bookerEmail,
    attendeeName: bookerName,
  });

  // When Quinn handles the booking, it sends its own combined reply with
  // the ICS attached — skip all separate confirmation/notification emails.
  if (skipEmails) {
    return {
      eventId: event.data.id!,
      token,
      startTime: start.toISOString(),
      duration,
      icsContent,
      locationDetails,
      locationType,
    };
  }

  // Send confirmation email (Email 02 — Booker) — non-fatal
  const firstName = firstNameOf(bookerName);
  const { dayOfWeek, monthDay, dayNumber } = formatDateParts(start, timezone);
  const emailTime = formatTimeWithTz(start, timezone);
  const emailDateTimeLine = formatDateTimeLine(start, end, timezone);
  const locationHtml = formatLocationHtml(locationType, locationDetails);

  const attendeeLines = [
    `${hostName}, ${hostEmailAddr}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const confirmationHtml = renderEmailHtml({
    headerLabel: "Booking Confirmation",
    bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Thanks for booking time on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(emailTime)}.<br><br>The full details are below, and a calendar invite is attached.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Date & Time", value: emailDateTimeLine },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", valueHtml: locationHtml },
      ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
      ...(safeDescription ? [{ label: "Topic", value: safeDescription }] : []),
    ],
    button: { text: "Manage Booking", url: manageUrl },
    afterBlockHtml: `Feel free to forward this invitation to anyone else that should attend.<br><br>If anything changes on your end, you can reschedule or cancel using your calendar or using the Manage Booking button above. Or, let me know with a quick reply to this email.`,
    closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
  });

  const confirmationText = [
    "Booking Confirmation",
    "",
    `Hi ${firstName},`,
    "",
    `Thanks for booking time on ${dayOfWeek}, ${monthDay} at ${emailTime}.`,
    "",
    "The full details are below, and a calendar invite is attached.",
    "",
    "Attendees:",
    ...attendeeLines,
    "",
    `Date & Time: ${emailDateTimeLine}`,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(bookerPhone ? [`Backup Phone: ${bookerPhone}`] : []),
    ...(safeDescription ? [`Topic: ${safeDescription}`] : []),
    "",
    `Manage Booking: ${manageUrl}`,
    "",
    "Feel free to forward this invitation to anyone else that should attend.",
    "",
    "If anything changes on your end, you can reschedule or cancel using your calendar or using the Manage Booking button above. Or, let me know with a quick reply to this email.",
    "",
    `See you on the ${ordinalSuffix(dayNumber)}!`,
  ].join("\n");

  sendEmail({
    to: bookerEmail,
    subject: `Booking confirmed \u2014 ${dayOfWeek}, ${monthDay} at ${emailTime}`,
    text: confirmationText,
    html: confirmationHtml,
    icsContent,
  }).catch((err) => log.error("Failed to send booking confirmation email", { error: String(err) }));

  // Host notification (Email 01 — Host) — non-fatal
  const emailHostTimezone = process.env.HOST_TIMEZONE ?? timezone;
  const hostParts = formatDateParts(start, emailHostTimezone);
  const hostTime = formatTimeWithTz(start, emailHostTimezone);
  const hostDateTimeLine = formatDateTimeLine(start, end, emailHostTimezone);

  const notificationHtml = renderEmailHtml({
    headerLabel: "New Booking",
    bodyHtml: `Quinn booked a meeting with ${escapeHtml(bookerName)} on ${escapeHtml(hostParts.dayOfWeek)}, ${escapeHtml(hostParts.monthDay)} at ${escapeHtml(hostTime)}.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Date & Time", value: hostDateTimeLine },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", value: locationLine },
      ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
      ...(safeDescription ? [{ label: "Topic", value: safeDescription }] : []),
    ],
    closingHtml: "It's on the calendar.",
  });

  const notificationText = [
    "New Booking",
    "",
    `Quinn booked a meeting with ${bookerName} on ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}.`,
    "",
    "Attendees:",
    ...attendeeLines,
    "",
    `Date & Time: ${hostDateTimeLine}`,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(bookerPhone ? [`Backup Phone: ${bookerPhone}`] : []),
    ...(safeDescription ? [`Topic: ${safeDescription}`] : []),
    "",
    "It's on the calendar.",
  ].join("\n");

  sendEmail({
    to: hostEmailAddr,
    subject: `New booking: ${bookerName} on ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}`,
    text: notificationText,
    html: notificationHtml,
  }).catch((err) => log.error("Failed to send host notification email", { error: String(err) }));

  // Additional attendee invitation emails — non-fatal
  const extraAttendees = additionalAttendees.filter((a) => a.email);
  for (const attendee of extraAttendees) {
    const attendeeFirstName = firstNameOf(attendee.name);
    const attendeeHtml = renderEmailHtml({
      headerLabel: "Meeting Invitation",
      bodyHtml: `Hi ${escapeHtml(attendeeFirstName)},<br><br>You've been added as a participant in a meeting on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(emailTime)}. Details are below, and a calendar invite is attached.`,
      detailRows: [
        { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
        { label: "Date & Time", value: emailDateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", valueHtml: locationHtml },
        ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
        ...(safeDescription ? [{ label: "Topic", value: safeDescription }] : []),
      ],
      closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
    });

    const attendeeText = [
      "Meeting Invitation",
      "",
      `Hi ${attendeeFirstName},`,
      "",
      `You've been added as a participant in a meeting on ${dayOfWeek}, ${monthDay} at ${emailTime}. Details are below, and a calendar invite is attached.`,
      "",
      "Attendees:",
      ...attendeeLines,
      "",
      `Date & Time: ${emailDateTimeLine}`,
      `Duration: ${duration} minutes`,
      `Location: ${locationLine}`,
      ...(bookerPhone ? [`Backup Phone: ${bookerPhone}`] : []),
      ...(safeDescription ? [`Topic: ${safeDescription}`] : []),
      "",
      `See you on the ${ordinalSuffix(dayNumber)}!`,
    ].join("\n");

    sendEmail({
      to: attendee.email!,
      subject: `Meeting on ${dayOfWeek}, ${monthDay} at ${emailTime}`,
      text: attendeeText,
      html: attendeeHtml,
      icsContent,
    }).catch((err) => log.error("Failed to send attendee invitation email", { error: String(err) }));
  }

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
    await withSpan("calendar.events.patch", () =>
      calendar.events.patch({
        calendarId,
        eventId: event.id!,
        sendUpdates: "none",
        requestBody: {
          start: { dateTime: newStart.toISOString(), timeZone: timezone },
          end: { dateTime: newEnd.toISOString(), timeZone: timezone },
        },
      }),
      { "calendar.operation": "reschedule", "booking.duration": duration }
    );
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
      }).catch((err) => log.error("Failed to update Zoom meeting on reschedule", { zoom_failure: true, error: String(err) }));
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
        log.error("Failed to delete Zoom meeting on cancellation", { zoom_failure: true, error: String(err) })
      );
    }
  }

  try {
    await withSpan("calendar.events.delete", () =>
      calendar.events.delete({
        calendarId,
        eventId: event.id!,
      }),
      { "calendar.operation": "cancel" }
    );
  } catch {
    throw new CalendarApiError("We're having trouble cancelling. Please try again.");
  }

  return { success: true, token };
}
