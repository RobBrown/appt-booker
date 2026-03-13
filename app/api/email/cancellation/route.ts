import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sendEmail,
  escapeHtml,
  firstNameOf,
  formatDateParts,
  formatTimeWithTz,
  formatDateTimeLine,
  formatLocationLine,
  renderEmailHtml,
} from "@/lib/gmail";
import { addMinutes } from "date-fns";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(limiters.email, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const {
      bookerName,
      bookerEmail,
      startTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      additionalAttendees = [],
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = addMinutes(start, duration);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostEmail = process.env.GMAIL_USER!;
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const hostTimezone = process.env.HOST_TIMEZONE ?? timezone;
    const bookUrl = `${hostDomain}/book`;

    const firstName = firstNameOf(bookerName);

    // Booker-timezone values
    const { dayOfWeek, monthDay } = formatDateParts(start, timezone);
    const time = formatTimeWithTz(start, timezone);
    const dateTimeLine = formatDateTimeLine(start, end, timezone);
    const locationLine = formatLocationLine(locationType, locationDetails);

    // Host-timezone values
    const hostParts = formatDateParts(start, hostTimezone);
    const hostTime = formatTimeWithTz(start, hostTimezone);
    const hostDateTimeLine = formatDateTimeLine(start, end, hostTimezone);

    // Attendees rows
    const attendeeLines = [
      `${hostName}, ${hostEmail}`,
      `${bookerName}, ${bookerEmail}`,
    ];

    // -------------------------------------------------------------------------
    // Email 05: Cancellation — Host
    // -------------------------------------------------------------------------
    const hostSubject = `Cancelled: ${bookerName} on ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}`;

    const hostHtml = renderEmailHtml({
      headerLabel: "Booking Cancelled",
      bodyHtml: `${escapeHtml(bookerName)} cancelled the booking on ${escapeHtml(hostParts.dayOfWeek)}, ${escapeHtml(hostParts.monthDay)} at ${escapeHtml(hostTime)}.`,
      detailRows: [
        {
          label: "Attendees",
          valueHtml: attendeeLines.map(escapeHtml).join("<br>"),
        },
        { label: "Date & Time", value: hostDateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", value: locationLine },
      ],
      closingHtml: "The calendar event has been removed.",
    });

    const hostText = [
      "Booking Cancelled",
      "",
      `${bookerName} cancelled the booking on ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}.`,
      "",
      "Attendees:",
      ...attendeeLines,
      "",
      `Date & Time: ${hostDateTimeLine}`,
      `Duration: ${duration} minutes`,
      `Location: ${locationLine}`,
      "",
      "The calendar event has been removed.",
    ].join("\n");

    await sendEmail({
      to: hostEmail,
      subject: hostSubject,
      text: hostText,
      html: hostHtml,
    });

    // -------------------------------------------------------------------------
    // Email 06: Cancellation — Booker
    // -------------------------------------------------------------------------
    const bookerSubject = `Booking cancelled \u2014 ${dayOfWeek}, ${monthDay} at ${time}`;

    const bookerHtml = renderEmailHtml({
      headerLabel: "Booking Cancelled",
      bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Your booking on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)} has been cancelled. The calendar event has been removed.`,
      detailRows: [
        {
          label: "Attendees",
          valueHtml: attendeeLines.map(escapeHtml).join("<br>"),
        },
        { label: "Date & Time", value: dateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", value: locationLine },
      ],
      button: { text: "Book a New Time", url: bookUrl },
      afterBlockHtml: "If you\u2019d like to find another time, the booking page is always open.",
    });

    const bookerText = [
      "Booking Cancelled",
      "",
      `Hi ${firstName},`,
      "",
      `Your booking on ${dayOfWeek}, ${monthDay} at ${time} has been cancelled. The calendar event has been removed.`,
      "",
      "Attendees:",
      ...attendeeLines,
      "",
      `Date & Time: ${dateTimeLine}`,
      `Duration: ${duration} minutes`,
      `Location: ${locationLine}`,
      "",
      `Book a New Time: ${bookUrl}`,
      "",
      "If you'd like to find another time, the booking page is always open.",
    ].join("\n");

    await sendEmail({
      to: bookerEmail,
      subject: bookerSubject,
      text: bookerText,
      html: bookerHtml,
    });

    // Additional attendee cancellation emails
    const extraAttendees = (additionalAttendees as Array<{ name: string; email?: string }>)
      .filter((a) => a.email);

    for (const attendee of extraAttendees) {
      const attendeeFirstName = firstNameOf(attendee.name);
      const attendeeHtml = renderEmailHtml({
        headerLabel: "Meeting Cancelled",
        bodyHtml: `Hi ${escapeHtml(attendeeFirstName)},<br><br>A meeting you were attending on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)} has been cancelled. The calendar event has been removed.`,
        detailRows: [
          { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
          { label: "Date & Time", value: dateTimeLine },
          { label: "Duration", value: `${duration} minutes` },
          { label: "Location", value: locationLine },
        ],
      });

      const attendeeText = [
        "Meeting Cancelled",
        "",
        `Hi ${attendeeFirstName},`,
        "",
        `A meeting you were attending on ${dayOfWeek}, ${monthDay} at ${time} has been cancelled. The calendar event has been removed.`,
        "",
        "Attendees:",
        ...attendeeLines,
        "",
        `Date & Time: ${dateTimeLine}`,
        `Duration: ${duration} minutes`,
        `Location: ${locationLine}`,
      ].join("\n");

      await sendEmail({
        to: attendee.email!,
        subject: `Meeting cancelled \u2014 ${dayOfWeek}, ${monthDay} at ${time}`,
        text: attendeeText,
        html: attendeeHtml,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to send cancellation emails." }, { status: 500 });
  }
}
