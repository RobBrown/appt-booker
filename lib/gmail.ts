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
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r/g, "").replace(/\n/g, "\\n");
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

// ---------------------------------------------------------------------------
// Spec-compliant email helpers
// ---------------------------------------------------------------------------

/** Extract the first word of a full name for "Hi {firstName}" greetings. */
export function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

/** Return the short timezone abbreviation for a point in time, e.g. "EST". */
export function getTzAbbr(date: Date, timezone: string): string {
  return (
    new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone
  );
}

/**
 * Format a time with its timezone abbreviation, e.g. "2:00 PM EST".
 * Used in email subjects and body copy.
 */
export function formatTimeWithTz(date: Date, timezone: string): string {
  return `${formatInTimeZone(date, timezone, "h:mm a")} ${getTzAbbr(date, timezone)}`;
}

/**
 * Format a compact time range with timezone abbreviation, e.g. "2:00 – 2:30 PM EST".
 * The start time omits AM/PM; the end time carries it along with the TZ abbreviation.
 */
export function formatTimeRangeWithTz(start: Date, end: Date, timezone: string): string {
  const startStr = formatInTimeZone(start, timezone, "h:mm");
  const endStr = formatInTimeZone(end, timezone, "h:mm a");
  const tzAbbr = getTzAbbr(start, timezone);
  return `${startStr} \u2013 ${endStr} ${tzAbbr}`;
}

/**
 * Parse individual date components for use in subjects and body text.
 * Returns dayOfWeek ("Thursday"), monthDay ("March 12"), year ("2026"), dayNumber (12).
 */
export function formatDateParts(
  date: Date,
  timezone: string
): { dayOfWeek: string; monthDay: string; year: string; dayNumber: number } {
  return {
    dayOfWeek: formatInTimeZone(date, timezone, "EEEE"),
    monthDay: formatInTimeZone(date, timezone, "MMMM d"),
    year: formatInTimeZone(date, timezone, "yyyy"),
    dayNumber: Number(formatInTimeZone(date, timezone, "d")),
  };
}

/**
 * Format the "Date & Time" details-block value per spec:
 * "Thursday, March 12, 2026 · 2:00 – 2:30 PM EST"
 */
export function formatDateTimeLine(start: Date, end: Date, timezone: string): string {
  const { dayOfWeek, monthDay, year } = formatDateParts(start, timezone);
  const timeRange = formatTimeRangeWithTz(start, end, timezone);
  return `${dayOfWeek}, ${monthDay}, ${year} \u00b7 ${timeRange}`;
}

/** Return the ordinal suffix for a day number: 1st, 2nd, 3rd, 4th, 11th, 21st, etc. */
export function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

// ---------------------------------------------------------------------------
// Shared HTML email renderer (spec-compliant table layout)
// ---------------------------------------------------------------------------

export interface EmailDetailRow {
  /** Uppercase label, e.g. "DATE & TIME" */
  label: string;
  /** Plain-text value (will be escaped) — use valueHtml for rich content */
  value?: string;
  /** Raw HTML value (not escaped) — used for links, line breaks, etc. */
  valueHtml?: string;
}

export interface EmailRenderOptions {
  /** Small label at the top of the email, e.g. "New Booking" */
  headerLabel: string;
  /** Paragraphs of body copy as HTML strings (already safe) */
  bodyHtml: string;
  /** Rows in the details block */
  detailRows: EmailDetailRow[];
  /** Optional CTA button inside the details block */
  button?: { text: string; url: string };
  /** Optional HTML rendered after the details block */
  afterBlockHtml?: string;
  /** Optional closing paragraph rendered last */
  closingHtml?: string;
}

/**
 * Render a complete HTML email per the transactional email spec.
 * Table-based layout, all styles inline.
 */
export function renderEmailHtml(opts: EmailRenderOptions): string {
  const detailRowsHtml = opts.detailRows
    .map((row) => {
      const val = row.valueHtml ?? escapeHtml(row.value ?? "");
      return `<tr>
          <td style="padding:10px 20px 0 0;font-size:12px;color:#8a8a86;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;vertical-align:top">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0 0 0;font-size:15px;color:#1a1a18;line-height:1.5;vertical-align:top">${val}</td>
        </tr>`;
    })
    .join("\n");

  const buttonHtml = opts.button
    ? `<tr>
        <td colspan="2" style="padding:20px 0 0 0">
          <a href="${escapeHtml(opts.button.url)}" style="display:inline-block;padding:10px 22px;background:#1a1a18;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">${escapeHtml(opts.button.text)}</a>
        </td>
      </tr>`
    : "";

  const afterBlockHtml = opts.afterBlockHtml
    ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#1a1a18">${opts.afterBlockHtml}</p>`
    : "";

  const closingHtml = opts.closingHtml
    ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#1a1a18">${opts.closingHtml}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f9f9f8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f8;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:6px;border:1px solid #e8e8e6">
          <tr>
            <td style="padding:40px 40px 32px">
              <p style="margin:0 0 20px;font-size:13px;color:#8a8a86;letter-spacing:0.02em">${escapeHtml(opts.headerLabel)}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#1a1a18">${opts.bodyHtml}</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9f9f8;border-radius:4px;border:1px solid #eeeeec">
                <tr>
                  <td style="padding:20px 24px">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      ${detailRowsHtml}
                      ${buttonHtml}
                    </table>
                  </td>
                </tr>
              </table>
              ${afterBlockHtml}
              ${closingHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
