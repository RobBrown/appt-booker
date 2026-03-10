import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getGoogleAuth } from "@/lib/google-auth";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// ICS builder
// ---------------------------------------------------------------------------

interface IcsOptions {
  uid: string;
  startTime: Date;
  duration: number; // minutes
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeName: string;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.substring(0, 75)];
  let rest = line.substring(75);
  while (rest.length > 0) {
    chunks.push(" " + rest.substring(0, 74));
    rest = rest.substring(74);
  }
  return chunks.join("\r\n");
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(opts: IcsOptions): string {
  const endTime = addMinutes(opts.startTime, opts.duration);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@appt-booker`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.startTime)}`,
    `DTEND:${icsDate(endTime)}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
    `DESCRIPTION:${escapeIcsText(opts.description)}`,
    `LOCATION:${escapeIcsText(opts.location)}`,
    `ORGANIZER;CN="${opts.organizerEmail}":mailto:${opts.organizerEmail}`,
    `ATTENDEE;CN="${opts.attendeeName}";RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n");
}

// ---------------------------------------------------------------------------
// MIME builder
// ---------------------------------------------------------------------------

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  icsContent?: string;
}

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMime(from: string, opts: SendEmailOptions, fromName?: string): string {
  const id = () => Math.random().toString(36).substring(2, 10);
  const outerBoundary = `mixed_${id()}`;
  const innerBoundary = `alt_${id()}`;

  const safeName = fromName ? sanitizeHeader(fromName) : undefined;
  const fromHeader = safeName ? `"${safeName.replace(/"/g, '\\"')}" <${sanitizeHeader(from)}>` : sanitizeHeader(from);
  const parts: string[] = [
    `MIME-Version: 1.0`,
    `From: ${fromHeader}`,
    `To: ${sanitizeHeader(opts.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    ``,
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.text,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    opts.html,
    ``,
    `--${innerBoundary}--`,
  ];

  if (opts.icsContent) {
    const rawB64 = Buffer.from(opts.icsContent).toString("base64");
    // Wrap at 76 chars per line as required by MIME spec
    const b64 = rawB64.match(/.{1,76}/g)!.join("\r\n");
    parts.push(
      `--${outerBoundary}`,
      `Content-Type: application/ics; name="invite.ics"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="invite.ics"`,
      ``,
      b64,
      ``
    );
  }

  parts.push(`--${outerBoundary}--`);
  return parts.join("\r\n");
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const from = process.env.GMAIL_USER!;
  const fromName = process.env.HOST_NAME;
  const mime = buildMime(from, opts, fromName);
  const raw = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmail = google.gmail({ version: "v1", auth: getGoogleAuth() });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const MEETING_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

export function meetingLabel(locationType: string): string {
  return MEETING_LABELS[locationType] ?? locationType;
}

export function formatDate(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "EEEE, MMMM d, yyyy");
}

export function formatTime(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "h:mm a");
}

export function formatTimeRange(start: Date, end: Date, timezone: string): string {
  return `${formatTime(start, timezone)} — ${formatTime(end, timezone)}`;
}

export function formatOrdinalDateTime(date: Date, timezone: string): string {
  const datePart = formatInTimeZone(date, timezone, "MMMM do, yyyy 'at' h:mm a");
  const tzAbbr =
    new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone;
  return `${datePart} ${tzAbbr}`;
}

export function formatLocationLine(locationType: string, locationDetails: string): string {
  const label = meetingLabel(locationType);
  return locationDetails ? `${label}, ${locationDetails}` : label;
}

export function formatLocationHtml(locationType: string, locationDetails: string): string {
  const label = meetingLabel(locationType);
  if (!locationDetails) return label;
  const isUrl = locationDetails.startsWith("https://") || locationDetails.startsWith("http://");
  if (isUrl) {
    const safeHref = escapeHtml(locationDetails);
    return `${label}, <a href="${safeHref}" style="color:#2563EB">${safeHref}</a>`;
  }
  return `${label}, ${escapeHtml(locationDetails)}`;
}

interface SummaryOptions {
  bookerName: string;
  additionalAttendees?: Array<{ name: string; email?: string }>;
  description?: string;
  startTime: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails?: string;
  bookerPhone?: string;
}

export function formatSummaryText(opts: SummaryOptions): string {
  const names = [
    opts.bookerName,
    ...(opts.additionalAttendees ?? []).map((a) => a.name).filter(Boolean),
  ].join(", ");

  const locationLine = formatLocationLine(opts.locationType, opts.locationDetails ?? "");
  const dateTimeLine = formatOrdinalDateTime(opts.startTime, opts.timezone);

  const parts: string[] = [names];
  if (opts.description) parts.push(opts.description);
  parts.push("");
  parts.push(dateTimeLine);
  parts.push(`${opts.duration} minutes`);
  parts.push("");
  parts.push(locationLine);
  if (opts.bookerPhone) parts.push(`Backup phone ${opts.bookerPhone}`);

  return parts.join("\n");
}

export function formatSummaryHtml(opts: SummaryOptions): string {
  const names = escapeHtml([
    opts.bookerName,
    ...(opts.additionalAttendees ?? []).map((a) => a.name).filter(Boolean),
  ].join(", "));

  const locationHtml = formatLocationHtml(opts.locationType, opts.locationDetails ?? "");
  const dateTimeLine = formatOrdinalDateTime(opts.startTime, opts.timezone);

  let html = `<p style="margin:0 0 2px;color:#111827">${names}</p>`;
  if (opts.description) {
    html += `<p style="margin:0 0 20px;color:#111827">${escapeHtml(opts.description).replace(/\n/g, "<br>")}</p>`;
  } else {
    html += `<div style="margin-bottom:20px"></div>`;
  }
  html += `<p style="margin:0 0 2px;color:#111827">${dateTimeLine}</p>`;
  html += `<p style="margin:0 0 20px;color:#111827">${opts.duration} minutes</p>`;
  html += `<p style="margin:0 0 2px;color:#111827">${locationHtml}</p>`;
  if (opts.bookerPhone) {
    html += `<p style="margin:0;color:#6B7280">Backup phone ${escapeHtml(opts.bookerPhone)}</p>`;
  }

  return html;
}
