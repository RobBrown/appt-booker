import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger, withSpan } from "@robbrown/observability-core";
import { getCalendarClient } from "@/lib/google-auth";
import { getAvailableSlots, getAvailableDatesInMonth } from "@/lib/availability";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

const log = logger.child({ service: "availability" });

const VALID_DURATIONS = [15, 30, 60, 120];

export async function GET(request: NextRequest) {
  try {
    const limited = await checkRateLimit(limiters.availability, request);
    if (limited) return limited;
  } catch (rlErr) {
    log.error("checkRateLimit threw", { error: String(rlErr) });
    return NextResponse.json(
      { error: "Rate limit service unavailable." },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = request.nextUrl;
    const month = searchParams.get("month"); // "YYYY-MM"
    const date = searchParams.get("date");   // "YYYY-MM-DD"
    const duration = Number(searchParams.get("duration"));
    const timezone = searchParams.get("timezone");

    if (!duration || !timezone) {
      return NextResponse.json(
        { error: "Missing required parameters: duration, timezone" },
        { status: 400 }
      );
    }

    if (!VALID_DURATIONS.includes(duration)) {
      return NextResponse.json(
        { error: "Invalid duration. Must be 15, 30, 60, or 120." },
        { status: 400 }
      );
    }

    if (timezone !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(timezone)) {
      return NextResponse.json(
        { error: "Invalid timezone." },
        { status: 400 }
      );
    }

    const calendar = getCalendarClient();

    // Month-level availability: returns which dates have at least one slot
    if (month && !date) {
      const [yearStr, monthStr] = month.split("-");
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1; // 0-indexed
      if (isNaN(year) || isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        return NextResponse.json({ error: "Invalid month format." }, { status: 400 });
      }
      const availableDates = await withSpan("calendar.freebusy", async (span) => {
        const dates = await getAvailableDatesInMonth(calendar, year, monthIndex, duration, timezone);
        span.setAttribute("availability.date_count", dates.length);
        return dates;
      }, { "availability.query": "month", "availability.month": month });
      return NextResponse.json({ month, timezone, duration, availableDates });
    }

    // Day-level availability: returns time slots for a specific date
    if (date) {
      const slots = await withSpan("calendar.freebusy", async (span) => {
        const result = await getAvailableSlots(calendar, date, duration, timezone);
        span.setAttribute("availability.slot_count", result.length);
        return result;
      }, { "availability.query": "day", "availability.date": date });
      return NextResponse.json({ date, timezone, duration, slots });
    }

    return NextResponse.json(
      { error: "Provide either date or month parameter." },
      { status: 400 }
    );
  } catch (error) {
    log.error("Availability fetch failed", { error: String(error) });
    try {
      Sentry.captureException(error);
    } catch (sentryErr) {
      log.error("Sentry.captureException threw", { error: String(sentryErr) });
    }
    return NextResponse.json(
      { error: "Failed to fetch availability." },
      { status: 500 }
    );
  }
}
