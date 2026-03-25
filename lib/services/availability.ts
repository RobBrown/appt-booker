/**
 * Availability service — importable functions shared by the API route and
 * MCP tool handlers.  No HTTP self-calls; all logic runs in-process.
 */

import { getCalendarClient } from "@/lib/google-auth";
import { getAvailableSlots as _getAvailableSlots } from "@/lib/availability";

const VALID_DURATIONS = [15, 30, 60, 120] as const;
export type ValidDuration = (typeof VALID_DURATIONS)[number];

export interface GetAvailabilityParams {
  date: string;        // "YYYY-MM-DD"
  duration: number;
  timezone: string;    // IANA timezone, defaults to "America/Toronto"
}

export interface GetAvailabilityResult {
  date: string;
  timezone: string;
  duration: number;
  slots: string[];     // HH:MM strings
}

/**
 * Returns available time slots for a given date / duration / timezone.
 * Throws on invalid inputs so callers can convert to structured errors.
 */
export async function getAvailability(
  params: GetAvailabilityParams
): Promise<GetAvailabilityResult> {
  const { date, duration, timezone } = params;

  if (!VALID_DURATIONS.includes(duration as ValidDuration)) {
    throw new Error(`Invalid duration. Must be one of: ${VALID_DURATIONS.join(", ")}.`);
  }

  if (timezone !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(timezone)) {
    throw new Error("Invalid timezone.");
  }

  // "YYYY-MM-DD" basic sanity check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  const calendar = getCalendarClient();
  const slots = await _getAvailableSlots(calendar, date, duration, timezone);
  return { date, timezone, duration, slots };
}
