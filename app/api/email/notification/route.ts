import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, withSpan } from "@robbrown/observability-core";
import {
  sendEmail,
  escapeHtml,
  formatDateParts,
  formatTimeWithTz,
  formatDateTimeLine,
  formatLocationLine,
  renderEmailHtml,
} from "@/lib/gmail";
import { addMinutes } from "date-fns";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

const log = logger.child({ service: "email", emailType: "notification" });

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(limiters.email, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const {
      bookerName,
      bookerEmail,
      bookerPhone = "",
      startTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      additionalAttendees = [],
      description = "",
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = addMinutes(start, duration);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostEmail = process.env.GMAIL_USER!;
    const hostTimezone = process.env.HOST_TIMEZONE ?? timezone;

    const { dayOfWeek, monthDay, year } = formatDateParts(start, hostTimezone);
    const time = formatTimeWithTz(start, hostTimezone);
    const dateTimeLine = formatDateTimeLine(start, end, hostTimezone);
    const locationLine = formatLocationLine(locationType, locationDetails);

    // Attendees: host first, then booker, then additional
    const attendeeLines = [
      `${hostName}, ${hostEmail}`,
      `${bookerName}, ${bookerEmail}`,
      ...(additionalAttendees as Array<{ name: string; email?: string }>)
        .map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
    ];

    const subject = `New booking: ${bookerName} on ${dayOfWeek}, ${monthDay} at ${time}`;

    const html = renderEmailHtml({
      headerLabel: "New Booking",
      bodyHtml: `${escapeHtml(bookerName)} booked time with you on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)}.`,
      detailRows: [
        {
          label: "Attendees",
          valueHtml: attendeeLines.map(escapeHtml).join("<br>"),
        },
        { label: "Date & Time", value: dateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", value: locationLine },
        ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
        ...(description ? [{ label: "Topic", value: description }] : []),
      ],
      closingHtml: "It's on the calendar.",
    });

    const text = [
      "New Booking",
      "",
      `${bookerName} booked time with you on ${dayOfWeek}, ${monthDay} at ${time}.`,
      "",
      "Attendees:",
      ...attendeeLines,
      "",
      `Date & Time: ${dateTimeLine}`,
      `Duration: ${duration} minutes`,
      `Location: ${locationLine}`,
      ...(bookerPhone ? [`Backup Phone: ${bookerPhone}`] : []),
      ...(description ? [`Topic: ${description}`] : []),
      "",
      `It's on the calendar.`,
    ].join("\n");

    log.info("Sending notification email");
    await withSpan("gmail.send", () => sendEmail({
      to: hostEmail,
      subject,
      text,
      html,
    }), { emailType: "notification" });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to send notification email", { error: String(error) });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to send notification email." },
      { status: 500 }
    );
  }
}
