import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, withSpan } from "@robbrown/observability-core";
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

const log = logger.child({ service: "email", emailType: "confirmation" });

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
      token,
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType || !token) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = addMinutes(start, duration);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostEmail = process.env.GMAIL_USER!;
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const manageUrl = `${hostDomain}/manage/${token}`;

    const firstName = firstNameOf(bookerName);
    const { dayOfWeek, monthDay, year, dayNumber } = formatDateParts(start, timezone);
    const time = formatTimeWithTz(start, timezone);
    const dateTimeLine = formatDateTimeLine(start, end, timezone);
    const locationLine = formatLocationLine(locationType, locationDetails);
    const locationHtml = formatLocationHtml(locationType, locationDetails);

    // Attendees: host first, then booker, then additional
    const attendeeLines = [
      `${hostName}, ${hostEmail}`,
      `${bookerName}, ${bookerEmail}`,
      ...(additionalAttendees as Array<{ name: string; email?: string }>)
        .map((a) => a.email ? `${a.name}, ${a.email}` : a.name),
    ];

    const subject = `Booking confirmed \u2014 ${dayOfWeek}, ${monthDay} at ${time}`;

    const html = renderEmailHtml({
      headerLabel: "Booking Confirmation",
      bodyHtml: `Hi ${escapeHtml(firstName)},<br><br>Thanks for booking time on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)}.<br><br>The full details are below, and a calendar invite is attached.`,
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
      afterBlockHtml: `Feel free to forward this invitation to anyone else that should attend.<br><br>If anything changes on your end, you can reschedule or cancel using your calendar or using the Manage Booking button above. Or, let me know with a quick reply to this email.`,
      closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
    });

    const text = [
      "Booking Confirmation",
      "",
      `Hi ${firstName},`,
      "",
      `Thanks for booking time on ${dayOfWeek}, ${monthDay} at ${time}.`,
      "",
      "The full details are below, and a calendar invite is attached.",
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
      "Feel free to forward this invitation to anyone else that should attend.",
      "",
      "If anything changes on your end, you can reschedule or cancel using your calendar or using the Manage Booking button above. Or, let me know with a quick reply to this email.",
      "",
      `See you on the ${ordinalSuffix(dayNumber)}!`,
    ].join("\n");

    // ICS
    const icsContent = buildIcs({
      uid: token,
      startTime: start,
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

    log.info("Sending confirmation email");
    await withSpan("gmail.send", () => sendEmail({
      to: bookerEmail,
      subject,
      text,
      html,
      icsContent,
    }), { emailType: "confirmation" });

    // Additional attendee invitation emails
    const extraAttendees = (additionalAttendees as Array<{ name: string; email?: string }>)
      .filter((a) => a.email);

    for (const attendee of extraAttendees) {
      const attendeeFirstName = firstNameOf(attendee.name);
      const attendeeHtml = renderEmailHtml({
        headerLabel: "Meeting Invitation",
        bodyHtml: `Hi ${escapeHtml(attendeeFirstName)},<br><br>You've been added as a participant in a meeting on ${escapeHtml(dayOfWeek)}, ${escapeHtml(monthDay)} at ${escapeHtml(time)}. Details are below, and a calendar invite is attached.`,
        detailRows: [
          { label: "Attendees", valueHtml: attendeeLines.map(escapeHtml).join("<br>") },
          { label: "Date & Time", value: dateTimeLine },
          { label: "Duration", value: `${duration} minutes` },
          { label: "Location", valueHtml: locationHtml },
          ...(bookerPhone ? [{ label: "Backup Phone", value: bookerPhone }] : []),
          ...(description ? [{ label: "Topic", value: description }] : []),
        ],
        closingHtml: `See you on the ${ordinalSuffix(dayNumber)}!`,
      });

      const attendeeText = [
        "Meeting Invitation",
        "",
        `Hi ${attendeeFirstName},`,
        "",
        `You've been added as a participant in a meeting on ${dayOfWeek}, ${monthDay} at ${time}. Details are below, and a calendar invite is attached.`,
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
        `See you on the ${ordinalSuffix(dayNumber)}!`,
      ].join("\n");

      await sendEmail({
        to: attendee.email!,
        subject: `Meeting on ${dayOfWeek}, ${monthDay} at ${time}`,
        text: attendeeText,
        html: attendeeHtml,
        icsContent,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to send confirmation email", { error: String(error) });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to send confirmation email." },
      { status: 500 }
    );
  }
}
