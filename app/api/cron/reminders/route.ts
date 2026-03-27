import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, withSpan } from "@hal866245/observability-core";

const log = logger.child({ service: "reminders" });
import { addHours, addMinutes } from "date-fns";
import { getCalendarClient } from "@/lib/google-auth";
import {
  sendEmail,
  escapeHtml,
  firstNameOf,
  meetingLabel,
  formatDateParts,
  formatTimeWithTz,
  formatDateTimeLine,
  formatLocationLine,
  formatLocationHtml,
  renderEmailHtml,
} from "@/lib/gmail";
// ---------------------------------------------------------------------------
// BOOKING_DATA block parser
// ---------------------------------------------------------------------------

function parseBookingData(description: string): Record<string, string> | null {
  const match = description.match(/BOOKING_DATA\r?\n([\s\S]*?)\r?\n\/BOOKING_DATA/);
  if (!match) return null;
  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Email builders
// ---------------------------------------------------------------------------

async function send24hBookerEmail(opts: {
  bookerName: string;
  bookerEmail: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  manageUrl: string;
  hostName: string;
  hostEmail: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
  topic?: string;
}) {
  const { bookerName, bookerEmail, start, end, duration, timezone, locationType, locationDetails, manageUrl, hostName, hostEmail, additionalAttendees, topic } = opts;
  const firstName = firstNameOf(bookerName);
  const { dayOfWeek, monthDay, year } = formatDateParts(start, timezone);
  const time = formatTimeWithTz(start, timezone);
  const dateTimeLine = formatDateTimeLine(start, end, timezone);
  const locationHtml = formatLocationHtml(locationType, locationDetails);
  const locationLine = formatLocationLine(locationType, locationDetails);

  const attendeeLines = [
    `${hostName}, ${hostEmail}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const subject = `Reminder \u2014 tomorrow at ${time}`;

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 Tomorrow",
    bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Just a heads up \u2014 your meeting is tomorrow at ${escapeHtml(time)}. Details below if you need them.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Date & Time", value: dateTimeLine },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", valueHtml: locationHtml },
      ...(topic ? [{ label: "Topic", value: topic }] : []),
    ],
    button: { text: "Manage Booking", url: manageUrl },
    afterBlockHtml: "If anything has changed, you can reschedule or cancel using the button above or reply to this email.",
    closingHtml: "See you tomorrow!",
  });

  const text = [
    "Reminder \u2014 Tomorrow",
    "",
    `Hi ${firstName},`,
    "",
    `Just a heads up \u2014 your meeting is tomorrow at ${time}. Details below if you need them.`,
    "",
    "Attendees:",
    ...attendeeLines,
    `Date & Time: ${dayOfWeek}, ${monthDay}, ${year} \u00b7 ${time}`,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(topic ? [`Topic: ${topic}`] : []),
    "",
    `Manage Booking: ${manageUrl}`,
    "",
    "If anything has changed, you can reschedule or cancel using the button above or reply to this email.",
    "",
    "See you tomorrow!",
  ].join("\n");

  await sendEmail({ to: bookerEmail, subject, text, html });
}

async function send24hHostEmail(opts: {
  bookerName: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  hostEmail: string;
  hostName: string;
  bookerEmail: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
  topic?: string;
}) {
  const { bookerName, start, end, duration, timezone, locationType, locationDetails, hostEmail, hostName, bookerEmail, additionalAttendees, topic } = opts;
  const { dayOfWeek, monthDay } = formatDateParts(start, timezone);
  const time = formatTimeWithTz(start, timezone);
  const dateTimeLine = formatDateTimeLine(start, end, timezone);
  const locationLine = formatLocationLine(locationType, locationDetails);

  const attendeeLines = [
    `${hostName}, ${hostEmail}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const subject = `Tomorrow: ${bookerName} at ${time}`;

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 Tomorrow",
    bodyHtml: `You have a meeting with ${escapeHtml(bookerName)} tomorrow at ${escapeHtml(time)}.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Date & Time", value: dateTimeLine },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", value: locationLine },
      ...(topic ? [{ label: "Topic", value: topic }] : []),
    ],
  });

  const text = [
    "Reminder \u2014 Tomorrow",
    "",
    `You have a meeting with ${bookerName} tomorrow at ${time}.`,
    "",
    "Attendees:",
    ...attendeeLines,
    `Date & Time: ${dayOfWeek}, ${monthDay} \u00b7 ${time}`,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(topic ? [`Topic: ${topic}`] : []),
  ].join("\n");

  await sendEmail({ to: hostEmail, subject, text, html });
}

async function send1hBookerEmail(opts: {
  bookerName: string;
  bookerEmail: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  manageUrl: string;
  hostName: string;
  hostEmail: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
  topic?: string;
}) {
  const { bookerName, bookerEmail, start, end, duration, timezone, locationType, locationDetails, manageUrl, hostName, hostEmail, additionalAttendees, topic } = opts;
  const firstName = firstNameOf(bookerName);
  const time = formatTimeWithTz(start, timezone);
  const locationHtml = formatLocationHtml(locationType, locationDetails);

  const attendeeLines = [
    `${hostName}, ${hostEmail}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const subject = "Reminder \u2014 1 hour";

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 1 Hour",
    bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Your meeting starts in one hour \u2014 ${escapeHtml(time)}. Here are the details.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", valueHtml: locationHtml },
      ...(topic ? [{ label: "Topic", value: topic }] : []),
    ],
    button: { text: "Manage Booking", url: manageUrl },
    closingHtml: "See you shortly!",
  });

  const locationLine = formatLocationLine(locationType, locationDetails);
  const text = [
    "Reminder \u2014 1 Hour",
    "",
    `Hi ${firstName},`,
    "",
    `Your meeting starts in one hour \u2014 ${time}. Here are the details.`,
    "",
    "Attendees:",
    ...attendeeLines,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(topic ? [`Topic: ${topic}`] : []),
    "",
    `Manage Booking: ${manageUrl}`,
    "",
    "See you shortly!",
  ].join("\n");

  await sendEmail({ to: bookerEmail, subject, text, html });
}

async function send1hHostEmail(opts: {
  bookerName: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  hostEmail: string;
  topic?: string;
}) {
  const { bookerName, start, end, duration, timezone, locationType, locationDetails, hostEmail, topic } = opts;
  const time = formatTimeWithTz(start, timezone);
  const locationLine = formatLocationLine(locationType, locationDetails);
  const label = meetingLabel(locationType);

  const subject = `In 1 hour: ${bookerName} at ${time}`;

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 1 Hour",
    bodyHtml: `${escapeHtml(bookerName)} in one hour \u2014 ${escapeHtml(time)}.`,
    detailRows: [
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", value: locationLine },
      ...(topic ? [{ label: "Topic", value: topic }] : []),
    ],
  });

  const text = [
    "Reminder \u2014 1 Hour",
    "",
    `${bookerName} in one hour \u2014 ${time}.`,
    "",
    `Duration: ${duration} minutes`,
    `Location: ${label}`,
    ...(topic ? [`Topic: ${topic}`] : []),
  ].join("\n");

  await sendEmail({ to: hostEmail, subject, text, html });
}

async function send24hAttendeeEmail(opts: {
  attendeeName: string;
  attendeeEmail: string;
  bookerName: string;
  bookerEmail: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  hostName: string;
  hostEmail: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
  topic?: string;
}) {
  const { attendeeName, attendeeEmail, bookerName, bookerEmail, start, end, duration, timezone, locationType, locationDetails, hostName, hostEmail, additionalAttendees, topic } = opts;
  const firstName = firstNameOf(attendeeName);
  const time = formatTimeWithTz(start, timezone);
  const dateTimeLine = formatDateTimeLine(start, end, timezone);
  const locationHtml = formatLocationHtml(locationType, locationDetails);
  const locationLine = formatLocationLine(locationType, locationDetails);
  const attendeeLines = [
    `${hostName}, ${hostEmail}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 Tomorrow",
    bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Just a heads up \u2014 your meeting is tomorrow at ${escapeHtml(time)}. Details below if you need them.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Date & Time", value: dateTimeLine },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", valueHtml: locationHtml },
      ...(topic ? [{ label: "Topic", value: topic }] : []),
    ],
    afterBlockHtml: "If anything has changed, reply to this email.",
    closingHtml: "See you tomorrow!",
  });

  const text = [
    "Reminder \u2014 Tomorrow",
    "",
    `Hi ${firstName},`,
    "",
    `Just a heads up \u2014 your meeting is tomorrow at ${time}. Details below if you need them.`,
    "",
    "Attendees:",
    ...attendeeLines,
    `Date & Time: ${dateTimeLine}`,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    ...(topic ? [`Topic: ${topic}`] : []),
    "",
    "If anything has changed, reply to this email.",
    "",
    "See you tomorrow!",
  ].join("\n");

  await sendEmail({ to: attendeeEmail, subject: `Reminder \u2014 tomorrow at ${time}`, text, html });
}

async function send1hAttendeeEmail(opts: {
  attendeeName: string;
  attendeeEmail: string;
  bookerName: string;
  bookerEmail: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  hostName: string;
  hostEmail: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
}) {
  const { attendeeName, attendeeEmail, bookerName, bookerEmail, start, end, duration, timezone, locationType, locationDetails, hostName, hostEmail, additionalAttendees } = opts;
  const firstName = firstNameOf(attendeeName);
  const time = formatTimeWithTz(start, timezone);
  const locationHtml = formatLocationHtml(locationType, locationDetails);
  const locationLine = formatLocationLine(locationType, locationDetails);
  const attendeeLines = [
    `${hostName}, ${hostEmail}`,
    `${bookerName}, ${bookerEmail}`,
    ...additionalAttendees.map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
  ];

  const html = renderEmailHtml({
    headerLabel: "Reminder \u2014 1 Hour",
    bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Your meeting starts in one hour \u2014 ${escapeHtml(time)}. Here are the details.`,
    detailRows: [
      { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
      { label: "Duration", value: `${duration} minutes` },
      { label: "Location", valueHtml: locationHtml },
    ],
    closingHtml: "See you shortly!",
  });

  const text = [
    "Reminder \u2014 1 Hour",
    "",
    `Hi ${firstName},`,
    "",
    `Your meeting starts in one hour \u2014 ${time}. Here are the details.`,
    "",
    "Attendees:",
    ...attendeeLines,
    `Duration: ${duration} minutes`,
    `Location: ${locationLine}`,
    "",
    "See you shortly!",
  ].join("\n");

  await sendEmail({ to: attendeeEmail, subject: "Reminder \u2014 1 hour", text, html });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const provided = authHeader ?? "";
  const expected = cronSecret ? `Bearer ${cronSecret}` : "";
  const authorised =
    cronSecret &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!authorised) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const hostName = process.env.HOST_NAME ?? "Your host";
  const hostDomain = process.env.HOST_DOMAIN ?? "";
  const hostEmail = process.env.GMAIL_USER!;
  const hostTimezone = process.env.HOST_TIMEZONE ?? "America/Toronto";

  const results: Array<{ eventId: string; type: string; sent: string[]; skipped?: string }> = [];

  try {
    return await withSpan("reminders.process", async (span) => {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const now = new Date();
    const timeMax = addHours(now, 25);

    const listRes = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const events = listRes.data.items ?? [];

    for (const event of events) {
      const eventId = event.id ?? "unknown";

      // Only process events created by this application
      const token = event.extendedProperties?.private?.token;
      if (!token) continue;

      // Parse BOOKING_DATA block
      const bookingData = parseBookingData(event.description ?? "");
      if (!bookingData) {
        results.push({ eventId, type: "skip", sent: [], skipped: "no BOOKING_DATA block" });
        continue;
      }

      // Prefer extendedProperties (written by current booking flow) over BOOKING_DATA
      const props = event.extendedProperties?.private ?? {};
      const bookerName = props.bookerName || bookingData?.name || "";
      const bookerEmail = props.bookerEmail || bookingData?.email || "";
      const timezone = props.timezone || bookingData?.timezone || "";
      const locationType = props.locationType || bookingData?.locationType || "";
      const locationDetails = props.locationDetails || bookingData?.locationDetails || "";
      const durationStr = props.duration || bookingData?.duration || "";
      const topic = props.description || bookingData?.topic || "";

      let additionalAttendees: Array<{ name: string; email?: string }> = [];
      try {
        if (props.additionalAttendeesJson) {
          additionalAttendees = JSON.parse(props.additionalAttendeesJson);
        }
      } catch {
        log.warn("Malformed additionalAttendeesJson", { eventId });
      }

      if (!bookerName || !bookerEmail || !timezone || !locationType || !durationStr) {
        results.push({ eventId, type: "skip", sent: [], skipped: "missing fields in BOOKING_DATA" });
        continue;
      }

      const duration = Number(durationStr);
      if (!duration) {
        results.push({ eventId, type: "skip", sent: [], skipped: "invalid duration" });
        continue;
      }

      const start = new Date(event.start!.dateTime!);
      const end = addMinutes(start, duration);
      const minutesUntil = (start.getTime() - now.getTime()) / 60000;

      const is24h = minutesUntil >= 23.5 * 60 && minutesUntil <= 24.5 * 60;
      const is1h = minutesUntil >= 45 && minutesUntil <= 75;

      if (!is24h && !is1h) continue;

      const reminderType = is24h ? "24h" : "1h";
      const manageUrl = `${hostDomain}/manage/${token}`;
      const sent: string[] = [];

      Sentry.addBreadcrumb({
        message: `Processing ${reminderType} reminder`,
        data: { eventId, bookerName, reminderType },
        level: "info",
      });

      if (is24h) {
        try {
          await send24hBookerEmail({
            bookerName, bookerEmail, start, end, duration, timezone,
            locationType, locationDetails, manageUrl, hostName, hostEmail,
            additionalAttendees, topic: topic || undefined,
          });
          sent.push("booker-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "booker-email" } });
        }

        try {
          await send24hHostEmail({
            bookerName, start, end, duration, timezone: hostTimezone,
            locationType, locationDetails, hostEmail, hostName, bookerEmail,
            additionalAttendees, topic: topic || undefined,
          });
          sent.push("host-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "host-email" } });
        }

        for (const attendee of additionalAttendees.filter((a) => a.email)) {
          try {
            await send24hAttendeeEmail({
              attendeeName: attendee.name, attendeeEmail: attendee.email!,
              bookerName, start, end, duration, timezone,
              locationType, locationDetails, hostName, hostEmail, bookerEmail,
              additionalAttendees, topic: topic || undefined,
            });
            sent.push(`attendee-email:${attendee.email}`);
          } catch (err) {
            Sentry.captureException(err, { extra: { eventId, reminderType, target: "attendee-email", attendeeEmail: attendee.email } });
          }
        }

      } else {
        try {
          await send1hBookerEmail({
            bookerName, bookerEmail, start, end, duration, timezone,
            locationType, locationDetails, manageUrl, hostName, hostEmail,
            additionalAttendees, topic: topic || undefined,
          });
          sent.push("booker-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "booker-email" } });
        }

        try {
          await send1hHostEmail({
            bookerName, start, end, duration, timezone: hostTimezone,
            locationType, locationDetails, hostEmail,
            topic: topic || undefined,
          });
          sent.push("host-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "host-email" } });
        }

        for (const attendee of additionalAttendees.filter((a) => a.email)) {
          try {
            await send1hAttendeeEmail({
              attendeeName: attendee.name, attendeeEmail: attendee.email!,
              bookerName, start, end, duration, timezone,
              locationType, locationDetails, hostName, hostEmail, bookerEmail,
              additionalAttendees,
            });
            sent.push(`attendee-email:${attendee.email}`);
          } catch (err) {
            Sentry.captureException(err, { extra: { eventId, reminderType, target: "attendee-email", attendeeEmail: attendee.email } });
          }
        }
      }

      log.info("Reminder sent", { reminderType, eventId, sent_count: sent.length });
      results.push({ eventId, type: reminderType, sent });
    }

    const sent = results.filter((r) => r.type !== "skip").length;
    const skipped = results.filter((r) => r.type === "skip").length;
    span.setAttribute("reminders.sent", sent);
    span.setAttribute("reminders.skipped", skipped);
    log.info("Reminders processed", { sent, skipped });
    return NextResponse.json({ ok: true, processed: sent, results });
    }); // end withSpan
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Reminder job failed." }, { status: 500 });
  }
}
