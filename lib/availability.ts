import { getCalendarClient } from "@/lib/google-auth";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { addMinutes, getDaysInMonth, getDay } from "date-fns";

type CalendarClient = ReturnType<typeof getCalendarClient>;

export interface BusyPeriod {
  start: Date;
  end: Date;
}

interface WorkingPeriod {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

const DEFAULT_WORKING_PERIODS: WorkingPeriod[] = [
  { dayOfWeek: 1, start: "08:00", end: "19:00" },
  { dayOfWeek: 2, start: "08:00", end: "19:00" },
  { dayOfWeek: 3, start: "08:00", end: "19:00" },
  { dayOfWeek: 4, start: "08:00", end: "19:00" },
  { dayOfWeek: 5, start: "08:00", end: "19:00" },
  { dayOfWeek: 6, start: "08:00", end: "19:00" },
  { dayOfWeek: 0, start: "08:00", end: "19:00" },
];

export async function getHostTimezone(calendar: CalendarClient): Promise<string> {
  if (process.env.HOST_TIMEZONE) return process.env.HOST_TIMEZONE;
  try {
    const res = await calendar.settings.get({ setting: "timezone" });
    return res.data.value ?? "UTC";
  } catch {
    return "UTC";
  }
}

async function getWorkingPeriods(calendar: CalendarClient): Promise<WorkingPeriod[]> {
  // Env var overrides take priority over everything
  const envStart = process.env.WORKING_HOURS_START;
  const envEnd = process.env.WORKING_HOURS_END;
  if (envStart && envEnd) {
    return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      start: envStart,
      end: envEnd,
    }));
  }

  try {
    const res = await calendar.settings.list();
    const items = res.data.items ?? [];
    const wh = items.find((i) => i.id === "workingHours");

    if (wh?.value) {
      const parsed = JSON.parse(wh.value) as {
        enabled?: boolean;
        periods?: Array<{
          start?: { dayOfWeek?: string; timeOfDay?: string };
          end?: { dayOfWeek?: string; timeOfDay?: string };
        }>;
      };

      if (parsed.enabled && parsed.periods?.length) {
        const dayMap: Record<string, number> = {
          SUNDAY: 0,
          MONDAY: 1,
          TUESDAY: 2,
          WEDNESDAY: 3,
          THURSDAY: 4,
          FRIDAY: 5,
          SATURDAY: 6,
        };

        const periods = parsed.periods
          .filter((p) => p.start?.dayOfWeek && p.start?.timeOfDay && p.end?.timeOfDay)
          .map((p) => ({
            dayOfWeek: dayMap[p.start!.dayOfWeek!] ?? 1,
            start: p.start!.timeOfDay!.substring(0, 5),
            end: p.end!.timeOfDay!.substring(0, 5),
          }));

        if (periods.length) return periods;
      }
    }
  } catch {
    // Fall through to defaults
  }

  return DEFAULT_WORKING_PERIODS;
}

export async function getBusyPeriods(
  calendar: CalendarClient,
  timeMin: Date,
  timeMax: Date,
  hostTimezone: string
): Promise<BusyPeriod[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy = freebusyRes.data.calendars?.[calendarId]?.busy ?? [];
  const busyPeriods: BusyPeriod[] = busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      start: new Date(b.start!),
      end: new Date(b.end!),
    }));

  // All-day events are not reliably included in freebusy — add them explicitly.
  // Isolated in try/catch so a failure here never breaks availability.
  try {
    const eventsRes = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      showDeleted: false,
    });
    for (const event of eventsRes.data.items ?? []) {
      if (event.start?.date && event.status !== "cancelled") {
        const startDate = event.start.date;
        const endDate = event.end?.date ?? startDate;
        busyPeriods.push({
          start: fromZonedTime(`${startDate}T00:00:00`, hostTimezone),
          end: fromZonedTime(`${endDate}T00:00:00`, hostTimezone),
        });
      }
    }
  } catch {
    // Non-fatal: freebusy is the primary source; all-day events may not be blocked
  }

  return busyPeriods;
}

export async function getAvailableDatesInMonth(
  calendar: CalendarClient,
  year: number,
  month: number, // 0-indexed (0 = January)
  duration: number,
  bookerTimezone: string
): Promise<string[]> {
  const [hostTimezone, workingPeriods] = await Promise.all([
    getHostTimezone(calendar),
    getWorkingPeriods(calendar),
  ]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStr = `${year}-${pad(month + 1)}`;
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  const monthStart = fromZonedTime(`${monthStr}-01T00:00:00`, bookerTimezone);
  const monthEnd = fromZonedTime(
    `${monthStr}-${pad(daysInMonth)}T23:59:59`,
    bookerTimezone
  );

  const busyPeriods = await getBusyPeriods(calendar, monthStart, monthEnd, hostTimezone);
  const now = new Date();
  const availableDates: string[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${pad(d)}`;
    const dayStart = fromZonedTime(`${dateStr}T00:00:00`, bookerTimezone);
    const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, bookerTimezone);
    if (dayEnd < now) continue;

    const hostDateStr = formatInTimeZone(dayStart, hostTimezone, "yyyy-MM-dd");
    const hostDayOfWeek = getDay(toZonedTime(dayStart, hostTimezone));
    const todaysPeriods = workingPeriods.filter((p) => p.dayOfWeek === hostDayOfWeek);
    if (!todaysPeriods.length) continue;

    let hasSlot = false;
    outer: for (const period of todaysPeriods) {
      const workStart = fromZonedTime(`${hostDateStr}T${period.start}:00`, hostTimezone);
      const workEnd = fromZonedTime(`${hostDateStr}T${period.end}:00`, hostTimezone);
      let current = workStart;
      while (addMinutes(current, duration).getTime() <= workEnd.getTime()) {
        if (current <= now) {
          current = addMinutes(current, 15);
          continue;
        }
        const slotEnd = addMinutes(current, duration);
        const isBusy = busyPeriods.some(
          (busy) =>
            current.getTime() < busy.end.getTime() &&
            slotEnd.getTime() > busy.start.getTime()
        );
        if (!isBusy) {
          const slotDate = formatInTimeZone(current, bookerTimezone, "yyyy-MM-dd");
          if (slotDate === dateStr) {
            hasSlot = true;
            break outer;
          }
        }
        current = addMinutes(current, 15);
      }
    }

    if (hasSlot) availableDates.push(dateStr);
  }

  return availableDates;
}

export async function getAvailableSlots(
  calendar: CalendarClient,
  date: string, // "YYYY-MM-DD" in booker's timezone
  duration: number, // minutes
  bookerTimezone: string
): Promise<string[]> {
  const [hostTimezone, workingPeriods] = await Promise.all([
    getHostTimezone(calendar),
    getWorkingPeriods(calendar),
  ]);

  // Full day in booker's timezone as UTC range for freebusy query
  const dayStart = fromZonedTime(`${date}T00:00:00`, bookerTimezone);
  const dayEnd = fromZonedTime(`${date}T23:59:59`, bookerTimezone);

  const busyPeriods = await getBusyPeriods(calendar, dayStart, dayEnd, hostTimezone);

  // Determine host's date and day-of-week at the start of the booker's requested day
  const hostDateStr = formatInTimeZone(dayStart, hostTimezone, "yyyy-MM-dd");
  const hostDayOfWeek = getDay(toZonedTime(dayStart, hostTimezone));

  const todaysPeriods = workingPeriods.filter((p) => p.dayOfWeek === hostDayOfWeek);
  if (!todaysPeriods.length) return [];

  const now = new Date();
  const slots: string[] = [];

  for (const period of todaysPeriods) {
    const workStart = fromZonedTime(`${hostDateStr}T${period.start}:00`, hostTimezone);
    const workEnd = fromZonedTime(`${hostDateStr}T${period.end}:00`, hostTimezone);

    let current = workStart;

    while (addMinutes(current, duration).getTime() <= workEnd.getTime()) {
      if (current <= now) {
        current = addMinutes(current, 15);
        continue;
      }
      const slotEnd = addMinutes(current, duration);

      const isBusy = busyPeriods.some(
        (busy) => current.getTime() < busy.end.getTime() && slotEnd.getTime() > busy.start.getTime()
      );

      if (!isBusy) {
        // Only return slots that fall on the requested date in the booker's timezone
        const slotDateInBookerTz = formatInTimeZone(current, bookerTimezone, "yyyy-MM-dd");
        if (slotDateInBookerTz === date) {
          slots.push(formatInTimeZone(current, bookerTimezone, "HH:mm"));
        }
      }

      current = addMinutes(current, 15);
    }
  }

  return slots;
}
