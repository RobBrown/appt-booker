import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, captureError, withSpan } from "@robbrown/observability-core";

const log = logger.child({ service: "bookings" });
import { addMinutes } from "date-fns";
import { getCalendarClient } from "@/lib/google-auth";
import { getBusyPeriods, getHostTimezone } from "@/lib/availability";
import { extractZoomMeetingId, updateZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { checkRateLimit, limiters } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";

type RouteContext = { params: Promise<{ token: string }> };

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
    timeMin: new Date().toISOString(),
    orderBy: "startTime",
  });
  return res.data.items?.[0] ?? null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const limited = await checkRateLimit(limiters.manageRead, request);
  if (limited) return limited;

  try {
    return await withSpan("bookings.get", async () => {
    const { token } = await context.params;
    const calendar = getCalendarClient();
    const event = await findEventByToken(calendar, token);

    if (!event) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const start = new Date(event.start!.dateTime!);
    const end = new Date(event.end!.dateTime!);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    const props = event.extendedProperties?.private ?? {};

    let additionalAttendees: Array<{ name: string; email?: string }> = [];
    try {
      if (props.additionalAttendeesJson) {
        additionalAttendees = JSON.parse(props.additionalAttendeesJson);
      }
    } catch {
      // malformed JSON — treat as empty
    }

    return NextResponse.json({
      eventId: event.id,
      token,
      startTime: start.toISOString(),
      duration,
      locationType: props.locationType ?? "",
      locationDetails: props.locationDetails ?? "",
      bookerName: props.bookerName ?? "",
      bookerEmail: props.bookerEmail ?? "",
      bookerPhone: props.bookerPhone ?? "",
      description: props.description ?? "",
      additionalAttendees,
    });
    }); // end withSpan
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to fetch booking." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const limited = await checkRateLimit(limiters.manageWrite, request);
  if (limited) return limited;

  try {
    return await withSpan("bookings.reschedule", async () => {
    const { token } = await context.params;
    const body = await request.json();
    const { newStartTime, timezone } = body;

    if (!newStartTime || !timezone) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const event = await findEventByToken(calendar, token);

    if (!event) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const oldStart = new Date(event.start!.dateTime!);
    const oldEnd = new Date(event.end!.dateTime!);
    const duration = Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000);

    const newStart = new Date(newStartTime);
    const newEnd = addMinutes(newStart, duration);

    // Check the new slot is available
    const hostTimezone = await getHostTimezone(calendar);
    const busyPeriods = await getBusyPeriods(calendar, newStart, newEnd, hostTimezone);
    const isConflict = busyPeriods.some(
      (busy) =>
        newStart.getTime() < busy.end.getTime() &&
        newEnd.getTime() > busy.start.getTime()
    );

    if (isConflict) {
      return NextResponse.json(
        { error: "Sorry, that time was just taken! Please choose another slot." },
        { status: 409 }
      );
    }

    await calendar.events.patch({
      calendarId,
      eventId: event.id!,
      sendUpdates: "none", // we handle reschedule emails ourselves
      requestBody: {
        start: { dateTime: newStart.toISOString(), timeZone: timezone },
        end: { dateTime: newEnd.toISOString(), timeZone: timezone },
      },
    });

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

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: props.bookerEmail ?? token,
      event: "api_booking_rescheduled",
      properties: {
        event_id: event.id,
        old_start_time: oldStart.toISOString(),
        new_start_time: newStart.toISOString(),
        duration_minutes: duration,
        location_type: props.locationType ?? "",
        timezone,
        source: "api",
      },
    });

    return NextResponse.json({
      eventId: event.id,
      token,
      startTime: newStart.toISOString(),
      duration,
    });
    }); // end withSpan
  } catch (error) {
    captureError(error as Error, { operation: "reschedule" });
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to reschedule booking." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const limited = await checkRateLimit(limiters.manageWrite, request);
  if (limited) return limited;

  try {
    return await withSpan("bookings.cancel", async () => {
    const { token } = await context.params;
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const event = await findEventByToken(calendar, token);

    if (!event) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
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

    await calendar.events.delete({
      calendarId,
      eventId: event.id!,
    });

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: props.bookerEmail ?? token,
      event: "api_booking_cancelled",
      properties: {
        event_id: event.id,
        duration_minutes: props.duration ? Number(props.duration) : undefined,
        location_type: props.locationType ?? "",
        source: "api",
      },
    });

    return NextResponse.json({ success: true });
    }); // end withSpan
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to cancel booking." }, { status: 500 });
  }
}
