import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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
      bookerPhone = "",
      newStartTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      additionalAttendees = [],
      description = "",
      token,
    } = body;

    if (
      !bookerName ||
      !bookerEmail ||
      !newStartTime ||
      !duration ||
      !timezone ||
      !locationType ||
      !token
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const newStart = new Date(newStartTime);
    const newEnd = addMinutes(newStart, duration);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostEmail = process.env.GMAIL_USER!;
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const hostTimezone = process.env.HOST_TIMEZONE ?? timezone;
    const manageUrl = `${hostDomain}/manage/${token}`;

    const firstName = firstNameOf(bookerName);

    // Booker-timezone values
    const { dayOfWeek, monthDay, dayNumber } = formatDateParts(newStart, timezone);
    const time = formatTimeWithTz(newStart, timezone);
    const dateTimeLine = formatDateTimeLine(newStart, newEnd, timezone);
    const locationHtml = formatLocationHtml(locationType, locationDetails);

    // Host-timezone values
    const hostParts = formatDateParts(newStart, hostTimezone);
    const hostTime = formatTimeWithTz(newStart, hostTimezone);
    const hostDateTimeLine = formatDateTimeLine(newStart, newEnd, hostTimezone);
    const locationLine = formatLocationLine(locationType, locationDetails);

    // Attendees
    const attendeeLines = [
      `${hostName}, ${hostEmail}`,
      `${bookerName}, ${bookerEmail}`,
      ...(additionalAttendees as Array<{ name: string; email?: string }>)
        .map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
    ];

    // -------------------------------------------------------------------------
    // Email 03: Reschedule — Host
    // -------------------------------------------------------------------------
    const hostSubject = `Rescheduled: ${bookerName} moved to ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}`;

    const hostHtml = renderEmailHtml({
      headerLabel: "Booking Rescheduled",
      bodyHtml: `${escapeHtml(bookerName)} rescheduled. The new time is ${escapeHtml(hostParts.dayOfWeek)}, ${escapeHtml(hostParts.monthDay)} at ${escapeHtml(hostTime)}.`,
      detailRows: [
        {
          label: "Attendees",
          valueHtml: attendeeLines.map(escapeHtml).join("<br>"),
        },
        { label: "Date & Time", value: hostDateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", value: locationLine },
        ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
        ...(description ? [{ label: "Topic", value: description }] : []),
      ],
      closingHtml: "The calendar has been updated.",
    });

    const hostText = [
      "Booking Rescheduled",
      "",
      `${bookerName} rescheduled. The new time is ${hostParts.dayOfWeek}, ${hostParts.monthDay} at ${hostTime}.`,
      "",
      "Attendees:",
      ...attendeeLines,
      "",
      `Date & Time: ${hostDateTimeLine}`,
      `Duration: ${duration} minutes`,
      `Location: ${locationLine}`,
      ...(bookerPhone ? [`Backup Phone: ${bookerPhone}`] : []),
      ...(description ? [`Topic: ${description}`] : []),
      "",
      "The calendar has been updated.",
    ].join("\n");

    await sendEmail({
      to: hostEmail,
      subject: hostSubject,
      text: hostText,
      html: hostHtml,
    });

    // -------------------------------------------------------------------------
    // Email 04: Reschedule — Booker
    // -------------------------------------------------------------------------
    const bookerSubject = `Booking moved \u2014 ${dayOfWeek}, ${monthDay} at ${time}`;

    // ICS with same UID (token) so calendar apps update the existing event
    const icsContent = buildIcs({
      uid: token,
      startTime: newStart,
      duration,
      summary: `Meeting with ${hostName}`,
      description: [
        `Meeting with ${hostName}`,
        ...(description ? [`Topic: ${description}`] : []),
      ].join("\n"),
      location: locationLine,
      organizerEmail: hostEmail,
      attendeeEmail: bookerEmail,
      attendeeName: bookerName,
    });

    const bookerHtml = renderEmailHtml({
      headerLabel: "Booking Rescheduled",
      bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Your booking has been moved to ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)}.<br><br>Updated details are below, and a new calendar invite is attached.`,
      detailRows: [
        {
          label: "Attendees",
          valueHtml: attendeeLines.map(escapeHtml).join("<br>"),
        },
        { label: "Date & Time", value: dateTimeLine },
        { label: "Duration", value: `${duration} minutes` },
        { label: "Location", valueHtml: locationHtml },
        ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
        ...(description ? [{ label: "Topic", value: description }] : []),
      ],
      button: { text: "Manage Booking", url: manageUrl },
      afterBlockHtml: "If anything else needs to change, use the Manage Booking button above or reply to this email.",
      closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
    });

    const bookerText = [
      "Booking Rescheduled",
      "",
      `Hi ${firstName},`,
      "",
      `Your booking has been moved to ${dayOfWeek}, ${monthDay} at ${time}.`,
      "",
      "Updated details are below, and a new calendar invite is attached.",
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
      `Manage Booking: ${manageUrl}`,
      "",
      "If anything else needs to change, use the Manage Booking button above or reply to this email.",
      "",
      `See you on the ${ordinalSuffix(dayNumber)}!`,
    ].join("\n");

    await sendEmail({
      to: bookerEmail,
      subject: bookerSubject,
      text: bookerText,
      html: bookerHtml,
      icsContent,
    });

    // Additional attendee reschedule emails
    const extraAttendees = (additionalAttendees as Array<{ name: string; email?: string }>)
      .filter((a) => a.email);

    for (const attendee of extraAttendees) {
      const attendeeFirstName = firstNameOf(attendee.name);
      const attendeeHtml = renderEmailHtml({
        headerLabel: "Meeting Rescheduled",
        bodyHtml: `Hi ${escapeHtml(attendeeFirstName)},<br><br>A meeting you're attending has been moved to ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)}. Updated details are below, and a new calendar invite is attached.`,
        detailRows: [
          { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
          { label: "Date & Time", value: dateTimeLine },
          { label: "Duration", value: `${duration} minutes` },
          { label: "Location", valueHtml: locationHtml },
          ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
          ...(description ? [{ label: "Topic", value: description }] : []),
        ],
        afterBlockHtml: "If anything else needs to change, reply to this email.",
        closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
      });

      const attendeeText = [
        "Meeting Rescheduled",
        "",
        `Hi ${attendeeFirstName},`,
        "",
        `A meeting you're attending has been moved to ${dayOfWeek}, ${monthDay} at ${time}. Updated details are below, and a new calendar invite is attached.`,
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
        "If anything else needs to change, reply to this email.",
        "",
        `See you on the ${ordinalSuffix(dayNumber)}!`,
      ].join("\n");

      await sendEmail({
        to: attendee.email!,
        subject: `Meeting moved \u2014 ${dayOfWeek}, ${monthDay} at ${time}`,
        text: attendeeText,
        html: attendeeHtml,
        icsContent,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to send reschedule emails." }, { status: 500 });
  }
}
