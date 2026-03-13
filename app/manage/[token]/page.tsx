"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { addMinutes, format, startOfToday } from "date-fns";
import { fromZonedTime, format as tzFormat } from "date-fns-tz";
import { DateTimeStep } from "@/components/booking/DateTimeStep";

interface Booking {
  eventId: string;
  token: string;
  startTime: string;
  duration: number;
  locationType: string;
  locationDetails: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  description: string;
  additionalAttendees: Array<{ name: string; email?: string }>;
}

type View =
  | "loading"
  | "invalid"
  | "idle"
  | "cancel-confirm"
  | "cancelling"
  | "cancelled"
  | "rescheduling"
  | "completing-reschedule"
  | "rescheduled";

const MEETING_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

function buildClientIcs(
  token: string,
  start: Date,
  duration: number,
  hostName: string,
  locationLine: string
): string {
  const end = addMinutes(start, duration);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${token}@appt-booker`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Meeting with ${hostName}`,
    `LOCATION:${locationLine}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(content: string, filename = "meeting.ics") {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ManagePage() {
  const { token } = useParams<{ token: string }>();
  const today = startOfToday();

  const [view, setView] = useState<View>("loading");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newStartTime, setNewStartTime] = useState<string | null>(null);

  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Reschedule calendar state
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [next4, setNext4] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [reschedYear, setReschedYear] = useState(today.getFullYear());
  const [reschedMonth, setReschedMonth] = useState(today.getMonth());

  // -------------------------------------------------------------------------
  // Load booking on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!token) return;
    fetch(`/api/bookings/${token}`)
      .then((res) => {
        if (res.status === 404) { setView("invalid"); return null; }
        if (!res.ok) { setView("invalid"); return null; }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setBooking(data);
        setView("idle");
      })
      .catch(() => setView("invalid"));
  }, [token]);

  // -------------------------------------------------------------------------
  // Availability fetching for reschedule
  // -------------------------------------------------------------------------
  const fetchMonthDates = useCallback(
    async (year: number, month: number, duration: number, tz: string) => {
      setDatesLoading(true);
      try {
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        const res = await fetch(
          `/api/availability?month=${monthStr}&duration=${duration}&timezone=${encodeURIComponent(tz)}`
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setAvailableDates(new Set<string>(data.availableDates ?? []));
        const todayStr = format(today, "yyyy-MM-dd");
        setNext4(
          ((data.availableDates ?? []) as string[])
            .filter((d) => d >= todayStr)
            .slice(0, 4)
        );
      } catch {
        setAvailableDates(new Set());
        setNext4([]);
      } finally {
        setDatesLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fetchSlots = useCallback(async (date: string, duration: number, tz: string) => {
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/availability?date=${date}&duration=${duration}&timezone=${encodeURIComponent(tz)}`
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "rescheduling" || !booking) return;
    fetchMonthDates(reschedYear, reschedMonth, booking.duration, timezone);
  }, [view, reschedYear, reschedMonth, booking, timezone, fetchMonthDates]);

  useEffect(() => {
    if (view !== "rescheduling" || !booking || !newDate) {
      setSlots([]);
      return;
    }
    fetchSlots(newDate, booking.duration, timezone);
  }, [view, newDate, booking, timezone, fetchSlots]);

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  const handleCancel = async () => {
    if (!booking) return;
    setView("cancelling");
    setActionError(null);

    try {
      const deleteRes = await fetch(`/api/bookings/${token}`, { method: "DELETE" });
      if (!deleteRes.ok) {
        const data = await deleteRes.json();
        setActionError(data.error ?? "Failed to cancel. Please try again.");
        setView("cancel-confirm");
        return;
      }

      // Fire-and-forget cancel emails + SMS
      fetch("/api/email/cancellation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookerName: booking.bookerName,
          bookerEmail: booking.bookerEmail,
          startTime: booking.startTime,
          duration: booking.duration,
          timezone,
          locationType: booking.locationType,
          locationDetails: booking.locationDetails,
          additionalAttendees: booking.additionalAttendees,
        }),
      }).catch(() => {});

      setView("cancelled");
    } catch {
      setActionError("Something went wrong. Please try again.");
      setView("cancel-confirm");
    }
  };

  // -------------------------------------------------------------------------
  // Reschedule
  // -------------------------------------------------------------------------
  const handleReschedule = async () => {
    if (!booking || !newDate || !newTime) return;
    setView("completing-reschedule");
    setActionError(null);

    const newStart = fromZonedTime(`${newDate}T${newTime}:00`, timezone).toISOString();

    try {
      const patchRes = await fetch(`/api/bookings/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStartTime: newStart, timezone }),
      });

      if (patchRes.status === 409) {
        const data = await patchRes.json();
        setActionError(data.error ?? "That time was just taken. Please choose another slot.");
        setNewTime(null);
        await fetchSlots(newDate, booking.duration, timezone);
        setView("rescheduling");
        return;
      }

      if (!patchRes.ok) {
        const data = await patchRes.json();
        setActionError(data.error ?? "Failed to reschedule. Please try again.");
        setView("rescheduling");
        return;
      }

      const { startTime: confirmedStart } = await patchRes.json();
      setNewStartTime(confirmedStart);

      // Fire-and-forget reschedule emails + SMS
      fetch("/api/email/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookerName: booking.bookerName,
          bookerEmail: booking.bookerEmail,
          oldStartTime: booking.startTime,
          newStartTime: confirmedStart,
          duration: booking.duration,
          timezone,
          locationType: booking.locationType,
          locationDetails: booking.locationDetails,
          description: booking.description,
          additionalAttendees: booking.additionalAttendees,
          token,
        }),
      }).catch(() => {});

      setView("rescheduled");
    } catch {
      setActionError("Something went wrong. Please try again.");
      setView("rescheduling");
    }
  };

  const enterReschedule = () => {
    setNewDate(null);
    setNewTime(null);
    setSlots([]);
    setAvailableDates(new Set());
    setNext4([]);
    setReschedYear(today.getFullYear());
    setReschedMonth(today.getMonth());
    setActionError(null);
    setView("rescheduling");
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function BookingSummary({ b, tz }: { b: Booking; tz: string }) {
    const start = new Date(b.startTime);
    const label = MEETING_LABELS[b.locationType] ?? b.locationType;
    const locationLine = b.locationDetails ? `${label}, ${b.locationDetails}` : label;
    const ordinalDateStr = tzFormat(start, "MMMM do, yyyy", { timeZone: tz });
    const timeStr = tzFormat(start, "h:mm a", { timeZone: tz });
    const tzAbbr =
      new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(start)
        .find((p) => p.type === "timeZoneName")?.value ?? tz;

    return (
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 space-y-2">
        <Row label="Name">{b.bookerName}</Row>
        <Row label="Date">{ordinalDateStr} at {timeStr} {tzAbbr}</Row>
        <Row label="Duration">{b.duration} minutes</Row>
        <Row label="Location">{locationLine}</Row>
        {b.bookerPhone && <Row label="Phone">Backup phone {b.bookerPhone}</Row>}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  if (view === "loading") {
    return (
      <PageShell title="Manage your booking">
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (view === "invalid") {
    return (
      <PageShell title="Manage your booking">
        <Card>
          <div className="text-center py-4 space-y-4">
            <p className="text-gray-900 dark:text-slate-100 font-medium">
              This link is no longer valid.
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              The appointment may have already been cancelled or rescheduled.
            </p>
            <a
              href="/"
              className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              Book a new time
            </a>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (view === "cancelled" && booking) {
    const start = new Date(booking.startTime);
    const dateStr = tzFormat(start, "MMMM d", { timeZone: timezone });
    const timeStr = tzFormat(start, "h:mm a", { timeZone: timezone });
    return (
      <PageShell centered>
        <ManageAnimStyles />
        <Card>
          <div className="text-center py-4 space-y-3">
            <div className="cancel-wrapper mx-auto relative" style={{ width: 80, height: 80 }}>
              <div className="manage-shimmer" />
              <svg viewBox="0 0 52 52" width="80" height="80">
                <circle className="circle-fill" cx="26" cy="26" r="25" fill="#4285F4" />
                <circle className="cancel-circle" cx="26" cy="26" r="25" />
                <path className="cancel-x" d="M16 16l20 20" />
                <path className="cancel-x" d="M36 16L16 36" />
              </svg>
            </div>
            <p className="text-gray-900 dark:text-slate-100 font-medium">
              Your appointment on {dateStr} at {timeStr} has been cancelled.
            </p>
            <a
              href="/"
              className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              Book a new time
            </a>
          </div>
        </Card>
      </PageShell>
    );
  }

  if ((view === "rescheduled") && booking && newStartTime) {
    const start = new Date(newStartTime);
    const end = addMinutes(start, booking.duration);
    const label = MEETING_LABELS[booking.locationType] ?? booking.locationType;
    const locationLine = booking.locationDetails ? `${label}, ${booking.locationDetails}` : label;
    const dateStr = tzFormat(start, "EEEE, MMMM d, yyyy", { timeZone: timezone });
    const ordinalDateStr = tzFormat(start, "MMMM do, yyyy", { timeZone: timezone });
    const timeStr = tzFormat(start, "h:mm a", { timeZone: timezone });
    const tzAbbr =
      new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
        .formatToParts(start)
        .find((p) => p.type === "timeZoneName")?.value ?? timezone;
    const gcalStart = start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const gcalEnd = end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Meeting`)}&dates=${gcalStart}/${gcalEnd}&location=${encodeURIComponent(locationLine)}`;

    const plainTextSummary = [
      booking.bookerName,
      "",
      `${ordinalDateStr} at ${timeStr} ${tzAbbr}`,
      `${booking.duration} minutes`,
      "",
      locationLine,
      ...(booking.bookerPhone ? [`Backup phone ${booking.bookerPhone}`] : []),
    ].join("\n");

    return (
      <PageShell centered>
        <ManageAnimStyles />
        <Card>
          <div className="text-center space-y-4">
            <div className="reschedule-wrapper mx-auto relative" style={{ width: 80, height: 80 }}>
              <div className="manage-shimmer" />
              <svg viewBox="0 0 52 52" width="80" height="80">
                <circle className="circle-fill" cx="26" cy="26" r="25" fill="#4285F4" />
                <path className="reschedule-path" d="M38 26c0-6.6-5.4-12-12-12s-12 5.4-12 12m0 0l-4-4m4 4l4-4" />
                <path className="reschedule-path" d="M14 26c0 6.6 5.4 12 12 12s12-5.4 12-12m0 0l4 4m-4-4l-4 4" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">You&rsquo;re rescheduled.</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {dateStr} at {timeStr} {tzAbbr}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href={gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Google Calendar
              </a>
              <button
                onClick={() =>
                  downloadIcs(
                    buildClientIcs(token, start, booking.duration, "your host", locationLine)
                  )
                }
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Apple / Outlook (.ics)
              </button>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(plainTextSummary)}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              Copy booking details
            </button>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (!booking) return null;

  // idle / cancel-confirm / cancelling
  if (view === "idle" || view === "cancel-confirm" || view === "cancelling") {
    return (
      <PageShell title="Manage your booking">
        <div className="space-y-4">
          <Card>
            <BookingSummary b={booking} tz={timezone} />
          </Card>

          {(view === "idle") && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={enterReschedule}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                Reschedule
              </button>
              <button
                onClick={() => { setActionError(null); setView("cancel-confirm"); }}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                Cancel this booking
              </button>
            </div>
          )}

          {(view === "cancel-confirm" || view === "cancelling") && (
            <Card>
              <div className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  Are you sure you want to cancel this booking? This cannot be undone.
                </p>
                {actionError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {actionError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={view === "cancelling"}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                  >
                    {view === "cancelling" ? "Cancelling…" : "Yes, cancel it"}
                  </button>
                  <button
                    onClick={() => { setActionError(null); setView("idle"); }}
                    disabled={view === "cancelling"}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                  >
                    Keep my booking
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </PageShell>
    );
  }

  // rescheduling / completing-reschedule
  if (view === "rescheduling" || view === "completing-reschedule") {
    return (
      <PageShell title="Let's Find a New Time">
        <div className="space-y-4">
          <Card>
            <DateTimeStep
              duration={booking.duration}
              selectedDate={newDate}
              selectedTime={newTime}
              timezone={timezone}
              calendarYear={reschedYear}
              calendarMonth={reschedMonth}
              availableDates={availableDates}
              next4={next4}
              slots={slots}
              slotsLoading={slotsLoading}
              datesLoading={datesLoading}
              onDateSelect={(date) => { setNewDate(date); setNewTime(null); }}
              onTimeSelect={setNewTime}
              onTimezoneChange={() => {}}
              onCalendarNav={(y, mo) => { setReschedYear(y); setReschedMonth(mo); }}
            />
          </Card>

          {actionError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {actionError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReschedule}
              disabled={!newDate || !newTime || view === "completing-reschedule"}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {view === "completing-reschedule" ? "Rescheduling…" : "Confirm reschedule"}
            </button>
            <button
              onClick={() => { setActionError(null); setView("idle"); }}
              disabled={view === "completing-reschedule"}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Back
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  return null;
}

// -------------------------------------------------------------------------
// Layout helpers
// -------------------------------------------------------------------------

function PageShell({ children, title, centered }: { children: React.ReactNode; title?: string; centered?: boolean }) {
  if (centered) {
    return (
      <div className="min-h-screen min-h-dvh bg-gray-50 dark:bg-slate-900 flex items-start sm:items-center justify-center pt-[15px] px-4 pb-4 sm:p-4">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-xl mx-auto px-4 py-6 sm:py-10">
        {title && (
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

function Card({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {label && (
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/80">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">{label}</h2>
        </div>
      )}
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-500 dark:text-slate-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-slate-100">{children}</span>
    </div>
  );
}

function ManageAnimStyles() {
  return (
    <style>{`
      @keyframes manage-bounce {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.12); }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes manage-circle-draw {
        to { stroke-dashoffset: 0; }
      }
      @keyframes manage-fill-pop {
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes manage-x-draw {
        to { stroke-dashoffset: 0; }
      }
      @keyframes manage-reschedule-draw {
        to { stroke-dashoffset: 0; }
      }
      @keyframes manage-rotate {
        from { transform: rotate(-90deg); }
        to { transform: rotate(0deg); }
      }
      @keyframes manage-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .cancel-wrapper {
        animation: manage-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .reschedule-wrapper {
        animation: manage-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .manage-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%);
        background-size: 200% 100%;
        border-radius: 50%;
        mix-blend-mode: screen;
        animation: manage-shimmer 1.5s ease-in-out 1.2s forwards;
        pointer-events: none;
      }
      .circle-fill {
        opacity: 0;
        transform: scale(0.8);
        transform-origin: center;
        animation: manage-fill-pop 0.4s ease-out 0.3s forwards;
      }
      .cancel-circle {
        fill: none;
        stroke: #4285F4;
        stroke-width: 2;
        stroke-dasharray: 160;
        stroke-dashoffset: 160;
        animation: manage-circle-draw 0.7s ease-out forwards;
      }
      .cancel-x {
        fill: none;
        stroke: white;
        stroke-width: 5;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 30;
        stroke-dashoffset: 30;
        animation: manage-x-draw 0.5s ease-out 0.5s forwards;
      }
      .reschedule-path {
        fill: none;
        stroke: white;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 60;
        stroke-dashoffset: 60;
        transform-origin: center;
        animation: manage-reschedule-draw 0.6s ease-out 0.5s forwards, manage-rotate 1s ease-out 0.5s forwards;
      }
    `}</style>
  );
}
