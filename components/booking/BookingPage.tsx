"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, startOfToday } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { DurationStep } from "./DurationStep";
import { DateTimeStep } from "./DateTimeStep";
import { LocationSection } from "./LocationSection";
import { AttendeesSection } from "./AttendeesSection";
import { AgendaSection } from "./AgendaSection";
import { SummaryPanel } from "./SummaryPanel";
import { ConfirmationScreen } from "./ConfirmationScreen";

interface Duration {
  minutes: number;
  label: string;
  hint: string;
}

interface Attendee {
  name: string;
  email: string;
}

interface BookingPageProps {
  hostName: string;
  contactEmail: string;
  hostDomain: string;
  defaultLocation: string;
  durations: Duration[];
  topicChips: string[];
}

const Avatar = () => (
  <img
    src="/avatar.png"
    alt="Host avatar"
    style={{
      width: 80,
      height: 80,
      borderRadius: "50%",
      objectFit: "cover",
      objectPosition: "center top",
      boxShadow: "0 0 0 3px rgba(59,130,246,0.3), 0 0 0 6px rgba(59,130,246,0.1)",
      flexShrink: 0,
    }}
  />
);

const StatusDot = () => (
  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: "#22c55e",
      display: "inline-block",
      boxShadow: "0 0 0 2px rgba(34,197,94,0.25)",
      animation: "bh-pulse 2.5s ease-in-out infinite",
    }} />
    <span style={{
      color: "#22c55e",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontFamily: "var(--font-dm-mono), monospace",
    }}>
      Accepting bookings
    </span>
  </span>
);

export function BookingPage({
  hostName,
  contactEmail,
  defaultLocation,
  durations,
}: BookingPageProps) {
  const searchParams = useSearchParams();
  const today = startOfToday();

  const [confirmed, setConfirmed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [duration, setDuration] = useState<number | null>(() => {
    const d = searchParams.get("duration");
    return d ? Number(d) : null;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [locationType, setLocationType] = useState<string>(() => {
    return searchParams.get("type") || defaultLocation || "zoom";
  });
  const [locationDetails, setLocationDetails] = useState<string>(
    ""
  );
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [description, setDescription] = useState("");
  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const [confirmedStartTime, setConfirmedStartTime] = useState<string | null>(null);

  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [next4, setNext4] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const fetchMonthDates = useCallback(
    async (year: number, month: number, dur: number, tz: string) => {
      setDatesLoading(true);
      try {
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        const res = await fetch(
          `/api/availability?month=${monthStr}&duration=${dur}&timezone=${encodeURIComponent(tz)}`
        );
        const data = await res.json();
        if (!res.ok) {
          if (data?.code === "RATE_LIMIT_SERVICE_DOWN") setServiceUnavailable(true);
          throw new Error("Failed");
        }
        const dates = new Set<string>(data.availableDates ?? []);
        setAvailableDates(dates);
        const todayStr = format(today, "yyyy-MM-dd");
        const upcoming = ((data.availableDates ?? []) as string[])
          .filter((d) => d >= todayStr)
          .slice(0, 4);
        setNext4(upcoming);
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

  const fetchSlots = useCallback(
    async (date: string, dur: number, tz: string) => {
      setSlotsLoading(true);
      try {
        const res = await fetch(
          `/api/availability?date=${date}&duration=${dur}&timezone=${encodeURIComponent(tz)}`
        );
        const data = await res.json();
        if (!res.ok) {
          if (data?.code === "RATE_LIMIT_SERVICE_DOWN") setServiceUnavailable(true);
          throw new Error("Failed");
        }
        setSlots(data.slots ?? []);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    []
  );

useEffect(() => {
    if (!duration) return;
    fetchMonthDates(calendarYear, calendarMonth, duration, timezone);
  }, [calendarYear, calendarMonth, duration, timezone, fetchMonthDates]);

  useEffect(() => {
    if (!selectedDate || !duration) {
      setSlots([]);
      return;
    }
    fetchSlots(selectedDate, duration, timezone);
  }, [selectedDate, duration, timezone, fetchSlots]);

  const handleReset = () => {
    setDuration(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setLocationType(defaultLocation || "zoom");
    setLocationDetails("");
    setAttendees([]);
    setDescription("");
    setBookerName("");
    setBookerEmail("");
    setBookerPhone("");
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
    setConfirmed(false);
    setConfirmedStartTime(null);
    setNameError("");
    setEmailError("");
    setBookingError(null);
    setEmailFailed(false);
    setAvailableDates(new Set());
    setNext4([]);
    setSlots([]);
  };

  const handleConfirm = async () => {
    let valid = true;
    if (!bookerName.trim()) {
      setNameError("Name is required.");
      valid = false;
    } else {
      setNameError("");
    }
    if (!bookerEmail.trim()) {
      setEmailError("Email is required.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookerEmail.trim())) {
      setEmailError("Enter a valid email address.");
      valid = false;
    } else {
      setEmailError("");
    }
    if (!valid || !duration || !selectedDate || !selectedTime) return;

    setIsConfirming(true);
    setBookingError(null);

    const startTime = fromZonedTime(
      `${selectedDate}T${selectedTime}:00`,
      timezone
    ).toISOString();

    const validAttendees = attendees.filter((a) => a.name.trim() || a.email.trim());

    try {
      // Step 1: Create booking
      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime,
          duration,
          timezone,
          locationType,
          locationDetails,
          bookerName: bookerName.trim(),
          bookerEmail: bookerEmail.trim(),
          ...(bookerPhone.trim() ? { bookerPhone: bookerPhone.trim() } : {}),
          additionalAttendees: validAttendees,
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });

      if (bookingRes.status === 409) {
        const data = await bookingRes.json();
        setBookingError(
          data.error ?? "That time was just taken. Please choose another slot."
        );
        setSelectedTime(null);
        if (selectedDate) await fetchSlots(selectedDate, duration, timezone);
        setIsConfirming(false);
        return;
      }

      if (!bookingRes.ok) {
        const data = await bookingRes.json();
        if (data?.code === "RATE_LIMIT_SERVICE_DOWN") {
          setServiceUnavailable(true);
          setIsConfirming(false);
          return;
        }
        setBookingError(
          data.error ?? "Something went wrong. Please try again."
        );
        setIsConfirming(false);
        return;
      }

      const { token, startTime: confirmedStart } = await bookingRes.json();
      setConfirmedStartTime(confirmedStart);
      setIsConfirming(false);
      setConfirmed(true);

      // Fire-and-forget emails — booking is already confirmed above
      const emailBody = JSON.stringify({
        bookerName: bookerName.trim(),
        bookerEmail: bookerEmail.trim(),
        ...(bookerPhone.trim() ? { bookerPhone: bookerPhone.trim() } : {}),
        startTime: confirmedStart,
        duration,
        timezone,
        locationType,
        locationDetails,
        additionalAttendees: validAttendees,
        ...(description.trim() ? { description: description.trim() } : {}),
        token,
      });

      fetch("/api/email/confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: emailBody,
      })
        .then((res) => { if (!res.ok) setEmailFailed(true); })
        .catch(() => setEmailFailed(true));

      fetch("/api/email/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: emailBody,
      }).catch(() => {});
    } catch {
      setBookingError("We couldn't confirm your booking. Please try again.");
      setIsConfirming(false);
    }
  };

  if (confirmed && confirmedStartTime && duration) {
    return (
      <ConfirmationScreen
        hostName={hostName}
        startTime={new Date(confirmedStartTime)}
        duration={duration}
        timezone={timezone}
        locationType={locationType}
        locationDetails={locationDetails}
        bookerName={bookerName}
        description={description}
        bookerPhone={bookerPhone}
        additionalAttendees={attendees}
        emailFailed={emailFailed}
        onReset={handleReset}
      />
    );
  }

  const REQUIRES_LINK = new Set(["zoom", "google-meet", "webex", "jitsi"]);
  const canConfirm =
    !!duration &&
    !!selectedDate &&
    !!selectedTime &&
    !!bookerName.trim() &&
    !!bookerEmail.trim() &&
    (!REQUIRES_LINK.has(locationType) || !!locationDetails.trim());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">

        <style>{`
          @keyframes bh-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(0.85); }
          }
          @keyframes bh-fadeUp {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .bh-header-row {
            animation: bh-fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.05s both;
          }
          .bh-about-link {
            color: #9ca3af;
            font-size: 11px;
            font-family: var(--font-dm-mono), monospace;
            letter-spacing: 0.04em;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            transition: color 0.2s;
          }
          .bh-about-link:hover { color: #6b7280; }
          .dark .bh-about-link { color: #6b7db3; }
          .dark .bh-about-link:hover { color: #93a8ff; }
        `}</style>

        <header className="mb-10">
          <div className="bh-header-row flex items-center justify-center gap-5">
            <Avatar />
            <div className="flex flex-col gap-1.5">
              <h1 style={{
                margin: 0,
                fontSize: "clamp(24px, 5vw, 30px)",
                fontWeight: 900,
                fontFamily: "var(--font-dm-sans), sans-serif",
                lineHeight: 1.1,
                letterSpacing: "-0.5px",
              }} className="text-gray-900 dark:text-slate-100">
                {hostName}
              </h1>
              <StatusDot />
              <button className="bh-about-link self-start" onClick={() => setAboutOpen(true)}>
                About this application ↗
              </button>
            </div>
          </div>
        </header>

        {/* Service unavailable modal */}
        {serviceUnavailable && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setServiceUnavailable(false)}
          >
            <div
              className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-amber-200 dark:border-amber-700 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                  Service temporarily unavailable
                </h2>
                <button
                  onClick={() => setServiceUnavailable(false)}
                  className="ml-4 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 hover:text-gray-800 dark:hover:text-white transition-colors text-base leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3 text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                <p>
                  This booking application relies on Upstash for rate limiting.
                  Upstash is currently experiencing a service disruption, which
                  is preventing requests from being processed.
                </p>
                <p>
                  Normal operation will resume automatically once Upstash
                  service is restored. Please try again shortly.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* About modal */}
        {aboutOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setAboutOpen(false)}
          >
            <div
              className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                  About this system
                </h2>
                <button
                  onClick={() => setAboutOpen(false)}
                  className="ml-4 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 hover:text-gray-800 dark:hover:text-white transition-colors text-base leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3 text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                <p>
                  This booking system was created and is privately hosted by{" "}
                  <span className="font-medium text-gray-900 dark:text-slate-100">{hostName}</span>.
                  It is not a third-party platform — there is no Calendly, no HubSpot, no
                  intermediary of any kind.
                </p>
                <p>
                  You can find the source code for this system on{" "}
                  <a
                    href="https://github.com/RobBrown/appt-booker"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    GitHub
                  </a>.
                </p>
                <p>
                  When you submit a booking, your details are sent directly to Google Calendar
                  via Google&rsquo;s API. Confirmation emails are delivered through Gmail.
                </p>
                <p>
                  Your information is not stored in a database, not sold, and not shared with
                  any third parties. It exists solely to schedule and communicate your appointment.
                </p>
                <p className="text-gray-400 dark:text-slate-500">
                  This is a private, self-hosted system.
                </p>
                <p className="text-gray-300 dark:text-slate-600 text-xs pt-1">
                  Version: {process.env.NEXT_PUBLIC_GIT_SHA}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">

          {/* Duration */}
          <Section label="How long should this meeting be?">
            <DurationStep
              selected={duration}
              onSelect={(d) => { setDuration(d); setSelectedTime(null); }}
              durations={durations}
            />
          </Section>

          {/* Date & Time */}
          <Section label="When should this meeting occur?">
            {!duration ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">
                Select a duration above to see available times.
              </p>
            ) : (
              <DateTimeStep
                duration={duration}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                timezone={timezone}
                calendarYear={calendarYear}
                calendarMonth={calendarMonth}
                availableDates={availableDates}
                next4={next4}
                slots={slots}
                slotsLoading={slotsLoading}
                datesLoading={datesLoading}
                onDateSelect={(date) => { setSelectedDate(date); setSelectedTime(null); }}
                onTimeSelect={setSelectedTime}
                onTimezoneChange={(tz) => {
                  setTimezone(tz);
                  setSelectedDate(null);
                  setSelectedTime(null);
                }}
                onCalendarNav={(y, mo) => { setCalendarYear(y); setCalendarMonth(mo); }}
              />
            )}
          </Section>

          {/* Where */}
          <Section label="Where should we meet?">
            <LocationSection
              locationType={locationType}
              locationDetails={locationDetails}
              hostFirstName={hostName.split(" ")[0]}
              duration={duration}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              timezone={timezone}
              onLocationTypeChange={setLocationType}
              onLocationDetailsChange={setLocationDetails}
              onServiceUnavailable={() => setServiceUnavailable(true)}
            />
          </Section>

          {/* Who */}
          <Section label="Who is attending?">
            <AttendeesSection
              bookerName={bookerName}
              bookerEmail={bookerEmail}
              bookerPhone={bookerPhone}
              nameError={nameError}
              emailError={emailError}
              attendees={attendees}
              onBookerNameChange={(v) => { setBookerName(v); if (nameError) setNameError(""); }}
              onBookerEmailChange={(v) => { setBookerEmail(v); if (emailError) setEmailError(""); }}
              onBookerPhoneChange={setBookerPhone}
              onAttendeesChange={setAttendees}
            />
          </Section>

          {/* Agenda */}
          <Section label="What is the agenda for this meeting?">
            <AgendaSection
              description={description}
              onDescriptionChange={setDescription}
            />
          </Section>

          {/* Summary */}
          <SummaryPanel
            duration={duration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            timezone={timezone}
            locationType={locationType}
            locationDetails={locationDetails}
            description={description}
            bookerPhone={bookerPhone}
            attendees={attendees}
            hostName={hostName}
            bookerName={bookerName}
          />

          {/* Confirm */}
          <div>
            {bookingError && (
              <div className="mb-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {bookingError}
              </div>
            )}
            <button
              onClick={handleConfirm}
              disabled={isConfirming || !canConfirm}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isConfirming ? "Booking…" : "Confirm booking"}
            </button>
            {!canConfirm && (
              <p className="mt-2 text-center text-xs text-gray-400 dark:text-slate-500">
                {!duration
                  ? "Select a duration to continue."
                  : !selectedDate || !selectedTime
                  ? "Select a date and time to continue."
                  : REQUIRES_LINK.has(locationType) && !locationDetails.trim()
                  ? "Add a meeting link to continue."
                  : "Enter your name and email to confirm."}
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {label && (
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/80">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
            {label}
          </h2>
        </div>
      )}
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  );
}
