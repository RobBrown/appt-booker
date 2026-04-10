import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, withSpan } from "@robbrown/observability-core";
import { fromZonedTime } from "date-fns-tz";
import { getGoogleAuth } from "@/lib/google-auth";
import { createZoomMeeting } from "@/lib/zoom";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

const log = logger.child({ service: "meetings" });

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(limiters.meetingsCreate, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { provider, duration, selectedDate, selectedTime, timezone } = body;

    if (!provider) {
      return NextResponse.json({ error: "Missing provider." }, { status: 400 });
    }

    // Resolve start time from user's selected date/time, or fall back to 1 hour from now
    const startTime =
      selectedDate && selectedTime && timezone
        ? fromZonedTime(`${selectedDate}T${selectedTime}:00`, timezone).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (provider === "jitsi") {
      const roomName = `appt-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      return NextResponse.json({ url: `https://meet.jit.si/${roomName}` });
    }

    if (provider === "zoom") {
      log.info("Creating meeting", { provider: "zoom" });
      const result = await withSpan("zoom.createMeeting", () => createZoomMeeting({
        startTime,
        duration: duration ?? 30,
        timezone: timezone ?? "UTC",
      }));
      return NextResponse.json({ url: result.url });
    }

    if (provider === "google-meet") {
      log.info("Creating meeting", { provider: "google-meet" });
      const auth = getGoogleAuth();
      const tokenResponse = await auth.getAccessToken();
      const token = tokenResponse.token;
      if (!token) throw new Error("Failed to obtain Google access token.");

      const data = await withSpan("google-meet.createMeeting", async () => {
        const res = await fetch("https://meet.googleapis.com/v2/spaces", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Google Meet API error ${res.status}: ${err}`);
        }

        return res.json();
      });
      return NextResponse.json({ url: data.meetingUri });
    }

    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  } catch (error) {
    log.error("Failed to create meeting", { error: String(error) });
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to create meeting." }, { status: 500 });
  }
}
