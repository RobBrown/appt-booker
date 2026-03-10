import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { addHours, addMinutes } from "date-fns";
import { getCalendarClient } from "@/lib/google-auth";
import {
  sendEmail,
  meetingLabel,
  formatDate,
  formatTime,
  formatTimeRange,
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
  locationLine: string;
  manageUrl: string;
  contactEmail: string;
  hostName: string;
}) {
  const { bookerName, bookerEmail, start, end, duration, timezone, locationLine, manageUrl, contactEmail, hostName } = opts;
  const dateStr = formatDate(start, timezone);
  const timeRange = formatTimeRange(start, end, timezone);
  const timeStr = formatTime(start, timezone);

  const text = [
    `Hi ${bookerName},`,
    ``,
    `Just a heads-up — you're meeting with ${hostName} tomorrow at ${timeStr}.`,
    ``,
    `Date: ${dateStr}`,
    `Time: ${timeRange} (${timezone})`,
    `Duration: ${duration} minutes`,
    `Meeting type: ${locationLine}`,
    ``,
    `If anything has changed, you can cancel or reschedule here:`,
    manageUrl,
    ``,
    `Questions? ${contactEmail}`,
    ``,
    hostName,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">See you tomorrow, ${bookerName}.</h1>
    <p style="margin:0 0 28px;color:#6B7280">Your meeting with ${hostName} is tomorrow at ${timeStr}.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Date</td><td style="padding:8px 0;color:#111827">${dateStr}</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Time</td><td style="padding:8px 0;color:#111827">${timeRange} <span style="color:#6B7280">(${timezone})</span></td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Duration</td><td style="padding:8px 0;color:#111827">${duration} minutes</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Meeting type</td><td style="padding:8px 0;color:#111827">${locationLine}</td></tr>
    </table>
    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>
    <p style="margin:0 0 12px;color:#6B7280;font-size:14px">Need to change your plans?</p>
    <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Cancel or reschedule</a>
    <p style="margin:28px 0 0;color:#6B7280;font-size:13px">Questions? <a href="mailto:${contactEmail}" style="color:#2563EB">${contactEmail}</a></p>
    <p style="margin:4px 0 0;color:#6B7280;font-size:13px">${hostName}</p>
  </div>
</body>
</html>`;

  await sendEmail({
    to: bookerEmail,
    subject: `Reminder: you're meeting with ${hostName} tomorrow at ${timeStr}`,
    text,
    html,
  });
}

async function send24hHostEmail(opts: {
  bookerName: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationLine: string;
  hostEmail: string;
}) {
  const { bookerName, start, end, duration, timezone, locationLine, hostEmail } = opts;
  const dateStr = formatDate(start, timezone);
  const timeRange = formatTimeRange(start, end, timezone);
  const timeStr = formatTime(start, timezone);

  const text = [
    `Tomorrow: ${bookerName}`,
    ``,
    `Date: ${dateStr}`,
    `Time: ${timeRange} (${timezone})`,
    `Duration: ${duration} minutes`,
    `Meeting type: ${locationLine}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">Tomorrow: ${bookerName}</h1>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Date</td><td style="padding:8px 0;color:#111827">${dateStr}</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Time</td><td style="padding:8px 0;color:#111827">${timeRange} <span style="color:#6B7280">(${timezone})</span></td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Duration</td><td style="padding:8px 0;color:#111827">${duration} minutes</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Meeting type</td><td style="padding:8px 0;color:#111827">${locationLine}</td></tr>
    </table>
  </div>
</body>
</html>`;

  await sendEmail({
    to: hostEmail,
    subject: `Tomorrow: ${bookerName} at ${timeStr}`,
    text,
    html,
  });
}

async function send1hBookerEmail(opts: {
  bookerName: string;
  bookerEmail: string;
  start: Date;
  end: Date;
  duration: number;
  timezone: string;
  locationLine: string;
  manageUrl: string;
  hostName: string;
}) {
  const { bookerName, bookerEmail, start, end, timezone, locationLine, manageUrl, hostName } = opts;
  const timeRange = formatTimeRange(start, end, timezone);
  const timeStr = formatTime(start, timezone);

  const text = [
    `Hi ${bookerName},`,
    ``,
    `Your meeting with ${hostName} starts in 1 hour at ${timeStr}.`,
    ``,
    `Time: ${timeRange} (${timezone})`,
    `Meeting type: ${locationLine}`,
    ``,
    `Need to cancel? ${manageUrl}`,
    ``,
    hostName,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">Starting in 1 hour.</h1>
    <p style="margin:0 0 28px;color:#6B7280">Your meeting with ${hostName} is at ${timeStr}.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Time</td><td style="padding:8px 0;color:#111827">${timeRange} <span style="color:#6B7280">(${timezone})</span></td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Meeting type</td><td style="padding:8px 0;color:#111827">${locationLine}</td></tr>
    </table>
    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>
    <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Cancel or reschedule</a>
    <p style="margin:28px 0 0;color:#6B7280;font-size:13px">${hostName}</p>
  </div>
</body>
</html>`;

  await sendEmail({
    to: bookerEmail,
    subject: `Your meeting with ${hostName} starts in 1 hour`,
    text,
    html,
  });
}

async function send1hHostEmail(opts: {
  bookerName: string;
  start: Date;
  end: Date;
  timezone: string;
  locationLine: string;
  hostEmail: string;
}) {
  const { bookerName, start, end, timezone, locationLine, hostEmail } = opts;
  const timeRange = formatTimeRange(start, end, timezone);
  const timeStr = formatTime(start, timezone);

  const text = [
    `Starting in 1 hour: ${bookerName}`,
    ``,
    `Time: ${timeRange} (${timezone})`,
    `Meeting type: ${locationLine}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">Starting in 1 hour: ${bookerName}</h1>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Time</td><td style="padding:8px 0;color:#111827">${timeRange} <span style="color:#6B7280">(${timezone})</span></td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:#6B7280;white-space:nowrap;vertical-align:top">Meeting type</td><td style="padding:8px 0;color:#111827">${locationLine}</td></tr>
    </table>
  </div>
</body>
</html>`;

  await sendEmail({
    to: hostEmail,
    subject: `Starting in 1 hour: ${bookerName} at ${timeStr}`,
    text,
    html,
  });
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
  const contactEmail = process.env.CONTACT_EMAIL ?? hostEmail;

  const results: Array<{ eventId: string; type: string; sent: string[]; skipped?: string }> = [];

  try {
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

      const { name: bookerName, email: bookerEmail, timezone, locationType, locationDetails = "", duration: durationStr } = bookingData;
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
      const label = meetingLabel(locationType);
      const locationLine = locationDetails ? `${label} — ${locationDetails}` : label;
      const manageUrl = `${hostDomain}/manage/${token}`;
      const sent: string[] = [];

      Sentry.addBreadcrumb({
        message: `Processing ${reminderType} reminder`,
        data: { eventId, bookerName, reminderType },
        level: "info",
      });

      if (is24h) {
        // Booker email
        try {
          await send24hBookerEmail({ bookerName, bookerEmail, start, end, duration, timezone, locationLine, manageUrl, contactEmail, hostName });
          sent.push("booker-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "booker-email" } });
        }

        // Host email
        try {
          await send24hHostEmail({ bookerName, start, end, duration, timezone, locationLine, hostEmail });
          sent.push("host-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "host-email" } });
        }

      } else {
        // 1h reminder
        // Booker email
        try {
          await send1hBookerEmail({ bookerName, bookerEmail, start, end, duration, timezone, locationLine, manageUrl, hostName });
          sent.push("booker-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "booker-email" } });
        }

        // Host email
        try {
          await send1hHostEmail({ bookerName, start, end, timezone, locationLine, hostEmail });
          sent.push("host-email");
        } catch (err) {
          Sentry.captureException(err, { extra: { eventId, reminderType, target: "host-email" } });
        }

      }

      console.log(`[reminders] ${reminderType} reminder for event ${eventId}: sent [${sent.join(", ")}]`);
      results.push({ eventId, type: reminderType, sent });
    }

    return NextResponse.json({ ok: true, processed: results.filter((r) => r.type !== "skip").length, results });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Reminder job failed." }, { status: 500 });
  }
}
