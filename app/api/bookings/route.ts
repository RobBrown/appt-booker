import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { addMinutes } from "date-fns";
import { getCalendarClient } from "@/lib/google-auth";
import { getBusyPeriods, getHostTimezone } from "@/lib/availability";
import { extractZoomMeetingId, updateZoomMeeting } from "@/lib/zoom";
import { formatOrdinalDateTime, formatLocationLine } from "@/lib/gmail";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

const MEETING_TYPE_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

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

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(limiters.bookings, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const {
      startTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      bookerName,
      bookerEmail,
      bookerPhone = "",
      additionalAttendees = [],
      description = "",
    } = body;

    if (!startTime || !duration || !timezone || !locationType || !bookerName || !bookerEmail) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (!/^[^\s@]{1,200}@[^\s@]{1,200}\.[^\s@]{1,50}$/.test(bookerEmail)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (bookerName.length > 200) {
      return NextResponse.json({ error: "Name is too long." }, { status: 400 });
    }
    if (bookerPhone.length > 50) {
      return NextResponse.json({ error: "Phone number is too long." }, { status: 400 });
    }
    if (locationDetails.length > 2000) {
      return NextResponse.json({ error: "Location details are too long." }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: "Description is too long." }, { status: 400 });
    }

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const start = new Date(startTime);
    const end = addMinutes(start, duration);

    // Re-query freebusy immediately to guard against race conditions
    const hostTimezone = await getHostTimezone(calendar);
    const busyPeriods = await getBusyPeriods(calendar, start, end, hostTimezone);
    const isConflict = busyPeriods.some(
      (busy) =>
        start.getTime() < busy.end.getTime() && end.getTime() > busy.start.getTime()
    );

    if (isConflict) {
      return NextResponse.json(
        { error: "Sorry, that time was just taken! Please choose another slot." },
        { status: 409 }
      );
    }

    const token = crypto.randomUUID();
    const hostName = process.env.HOST_NAME ?? "Host";
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const meetingLabel = MEETING_TYPE_LABELS[locationType] ?? locationType;
    const eventTitle = `${bookerName} — ${duration} Min ${meetingLabel}`;

    const attendeeNames = [
      bookerName,
      ...additionalAttendees.map((a: { name: string }) => a.name).filter(Boolean),
      hostName,
    ].join(", ");

    const locationLine = formatLocationLine(locationType, locationDetails);
    const dateTimeLine = formatOrdinalDateTime(start, timezone);
    const manageUrl = hostDomain ? `${hostDomain}/manage/${token}` : "";

    const descParts: string[] = [
      attendeeNames,
      ...(description ? [description] : []),
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

    // Build guest list (booker + any additional attendees with emails)
    const guests = [
      { email: bookerEmail, displayName: bookerName },
      ...additionalAttendees
        .filter((a: { name: string; email: string }) => a.email)
        .map((a: { name: string; email: string }) => ({ email: a.email, displayName: a.name })),
    ];

    // Create event with exponential backoff retry
    const event = await withRetry(() =>
      calendar.events.insert({
        calendarId,
        sendUpdates: "none", // we handle confirmation emails ourselves
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
              description,
              additionalAttendeesJson: JSON.stringify(additionalAttendees),
            },
          },
        },
      })
    );

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

    return NextResponse.json({
      eventId: event.data.id,
      token,
      startTime: start.toISOString(),
      duration,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      {
        error:
          "We're having trouble confirming your booking. Please try again in a moment.",
      },
      { status: 503 }
    );
  }
}
