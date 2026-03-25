/**
 * Meeting link service — shared helper for generating video conference links.
 *
 * Used by createBooking to auto-generate links when locationDetails is empty
 * and locationType is zoom, google-meet, or jitsi.
 */

import { getGoogleAuth } from "@/lib/google-auth";
import { createZoomMeeting } from "@/lib/zoom";
import { CalendarApiError } from "@/lib/services/bookings";

export async function createMeetingLink(
  provider: "zoom" | "google-meet" | "jitsi",
  startTime: Date,
  duration: number,
  timezone: string
): Promise<string> {
  if (provider === "jitsi") {
    const roomName = `appt-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    return `https://meet.jit.si/${roomName}`;
  }

  if (provider === "zoom") {
    try {
      const result = await createZoomMeeting({
        startTime: startTime.toISOString(),
        duration,
        timezone,
      });
      return result.url;
    } catch (err) {
      throw new CalendarApiError(
        `Failed to create Zoom meeting: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (provider === "google-meet") {
    const auth = getGoogleAuth();
    const tokenResponse = await auth.getAccessToken();
    const token = tokenResponse.token;
    if (!token) {
      throw new CalendarApiError("Failed to obtain Google access token for Meet.");
    }

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
      throw new CalendarApiError(
        `Google Meet API error ${res.status}: ${err}`
      );
    }

    const data = await res.json() as { meetingUri: string };
    return data.meetingUri;
  }

  // TypeScript exhaustiveness — should never reach here
  throw new CalendarApiError(`Unsupported meeting provider: ${provider}`);
}
