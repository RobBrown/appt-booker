import { nextDay, formatISO, getDay } from "date-fns";
import type { Day } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Intent } from "@/lib/quinn/intent";

// ---------------------------------------------------------------------------
// Day name → date-fns Day enum mapping
// ---------------------------------------------------------------------------

const DAY_NAME_MAP: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// ---------------------------------------------------------------------------
// resolveNextWeekday
//
// Returns the next occurrence of `dayName` after `referenceDate`.
// Uses date-fns `nextDay` which always returns the NEXT occurrence (never
// today), so "Wednesday" on a Wednesday returns the following Wednesday.
//
// Parameters:
//   dayName       – case-insensitive day name (e.g. "tuesday", "Sunday")
//   referenceDate – the date to resolve relative to (never Date.now())
//
// Throws if `dayName` is not a recognised weekday.
// ---------------------------------------------------------------------------

export function resolveNextWeekday(
  dayName: string,
  referenceDate: Date
): Date {
  const key = dayName.toLowerCase();
  const targetDay = DAY_NAME_MAP[key];

  if (targetDay === undefined) {
    throw new Error(`Unrecognised day name: "${dayName}"`);
  }

  // date-fns nextDay: if referenceDate is already `targetDay` it still moves
  // forward 7 days — exactly the "forward only, never today" semantics needed.
  return nextDay(referenceDate, targetDay);
}

// ---------------------------------------------------------------------------
// resolveRawDateText (internal)
//
// Attempts to convert a free-text date description into an ISO string.
// Handles two patterns:
//   1. "next Tuesday"              → date-only ISO (YYYY-MM-DD)
//   2. "next Tuesday at 2pm"       → full datetime ISO in UTC
//   3. "2026-04-15" (already ISO)  → returned as-is
//   4. Unrecognised text           → null (Phase 3 will ask for clarification)
//
// This is intentionally narrow. Complex NLP is Claude's job. This handles
// only the common "next [weekday] [at time]" pattern.
//
// Parameters:
//   rawDateText   – free-text extracted by Claude
//   referenceDate – reference for relative resolution (never Date.now())
//   timezone      – IANA timezone for datetime conversion to UTC
// ---------------------------------------------------------------------------

function resolveRawDateText(
  rawDateText: string,
  referenceDate: Date,
  timezone: string
): string | null {
  // Pattern 1: already looks like an ISO date — pass through unchanged
  if (/^\d{4}-\d{2}-\d{2}/.test(rawDateText)) {
    return rawDateText;
  }

  // Pattern 2: extract a weekday name
  const dayMatch = rawDateText.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (!dayMatch) {
    // Cannot resolve — no day name found
    return null;
  }

  const resolvedDay = resolveNextWeekday(dayMatch[1], referenceDate);

  // Pattern 3: extract a time component (e.g. "2pm", "2:30pm", "14:00")
  const timeMatch = rawDateText.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );

  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === "pm" && hour < 12) {
      hour += 12;
    } else if (ampm === "am" && hour === 12) {
      hour = 0;
    }

    // Build a date in the target timezone, then convert to UTC
    const year = resolvedDay.getUTCFullYear();
    const month = resolvedDay.getUTCMonth() + 1;
    const day = resolvedDay.getUTCDate();

    // Construct a local-time string, then interpret it as the given timezone
    const localDateTimeStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const utcDate = fromZonedTime(localDateTimeStr, timezone);
    // Format as UTC ISO string (Z suffix) so callers get a consistent UTC value
    return utcDate.toISOString();
  }

  // Day found but no time — return date-only ISO string
  const year = resolvedDay.getUTCFullYear();
  const month = resolvedDay.getUTCMonth() + 1;
  const day = resolvedDay.getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// resolveDefaults
//
// Transforms raw Claude intent output into a fully-resolved intent by:
//   1. Defaulting `duration` to 30 minutes when null (book, check_availability)
//   2. Defaulting `timezone` to "America/Toronto" when null
//      (book, reschedule, check_availability)
//   3. Resolving `rawDateText` to a concrete ISO string when `requestedDate`
//      is null (book, reschedule, check_availability)
//   4. Recording every applied default in the `assumptions` array
//
// Parameters:
//   intent        – parsed Intent from Claude (may have null fields)
//   referenceDate – used for relative date resolution (never Date.now())
//
// Returns a new Intent object — the input is NOT mutated.
// ---------------------------------------------------------------------------

export function resolveDefaults(intent: Intent, referenceDate: Date): Intent {
  // Cancel and Unknown intents have no date/duration fields to default
  if (intent.intent === "cancel" || intent.intent === "unknown") {
    return intent;
  }

  // Clone to avoid mutating the input
  const assumptions = [...intent.assumptions];

  // -------------------------------------------------------------------------
  // Step 1: Duration default (book, check_availability only)
  // -------------------------------------------------------------------------

  let duration: number | null = null;

  if (intent.intent === "book" || intent.intent === "check_availability") {
    duration = intent.duration;
    if (duration === null) {
      duration = 30;
      assumptions.push("Assumed 30-minute duration since none was specified");
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Timezone default (book, reschedule, check_availability)
  // -------------------------------------------------------------------------

  let timezone: string | null = intent.timezone;
  if (timezone === null) {
    timezone = "America/Toronto";
    assumptions.push(
      "Assumed America/Toronto timezone since none was specified"
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Relative date resolution (book, reschedule, check_availability)
  // -------------------------------------------------------------------------

  let requestedDate: string | null = intent.requestedDate;

  if (requestedDate === null && intent.rawDateText !== null) {
    const resolved = resolveRawDateText(
      intent.rawDateText,
      referenceDate,
      timezone
    );
    if (resolved !== null) {
      requestedDate = resolved;
      // Include the raw text in the assumption so Quinn can explain it
      const dateOnly = resolved.slice(0, 10);
      assumptions.push(`Resolved '${intent.rawDateText}' to ${dateOnly}`);
    }
  }

  // -------------------------------------------------------------------------
  // Return transformed intent (spread preserves discriminant and other fields)
  // -------------------------------------------------------------------------

  if (intent.intent === "book") {
    return {
      ...intent,
      duration,
      timezone,
      requestedDate,
      assumptions,
    };
  }

  if (intent.intent === "reschedule") {
    return {
      ...intent,
      timezone,
      requestedDate,
      assumptions,
    };
  }

  // check_availability
  return {
    ...intent,
    duration,
    timezone,
    requestedDate,
    assumptions,
  };
}
