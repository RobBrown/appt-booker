"use client";

import { useState } from "react";
import { addMinutes } from "date-fns";
import { format } from "date-fns-tz";
import posthog from "posthog-js";

interface ConfirmationScreenProps {
  hostName: string;
  startTime: Date;
  duration: number;
  timezone: string;
  locationType: string;
  locationDetails: string;
  bookerName: string;
  description: string;
  bookerPhone: string;
  additionalAttendees: Array<{ name: string; email: string }>;
  emailFailed?: boolean;
  onReset: () => void;
}

const MEETING_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

function buildClientIcs(start: Date, duration: number, summary: string, location: string): string {
  const end = addMinutes(start, duration);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meeting.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export function ConfirmationScreen({
  hostName,
  startTime,
  duration,
  timezone,
  locationType,
  locationDetails,
  bookerName,
  description,
  bookerPhone,
  additionalAttendees,
  emailFailed,
  onReset,
}: ConfirmationScreenProps) {
  const end = addMinutes(startTime, duration);
  const label = MEETING_LABELS[locationType] ?? locationType;
  const locationLine = locationDetails ? `${label}, ${locationDetails}` : label;

  const dateStr = format(startTime, "EEEE, MMMM d, yyyy", { timeZone: timezone });
  const timeStr = format(startTime, "h:mm a", { timeZone: timezone });
  const ordinalDateStr = format(startTime, "MMMM do, yyyy", { timeZone: timezone });
  const tzAbbr = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "short",
  })
    .formatToParts(startTime)
    .find((p) => p.type === "timeZoneName")?.value ?? timezone;

  const attendeeNames = [
    ...(bookerName ? [bookerName] : []),
    ...additionalAttendees.map((a) => a.name).filter(Boolean),
    hostName,
  ].join(", ");

  // Google Calendar deep link
  const gcalStart = startTime.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const gcalEnd = end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Meeting with ${hostName}`)}&dates=${gcalStart}/${gcalEnd}&location=${encodeURIComponent(locationLine)}`;

  const icsContent = buildClientIcs(
    startTime,
    duration,
    `Meeting with ${hostName}`,
    locationLine
  );

  const plainTextParts = [
    ...(attendeeNames ? [attendeeNames] : []),
    ...(description ? [description] : []),
    "",
    `${ordinalDateStr} at ${timeStr} ${tzAbbr}`,
    `${duration} minutes`,
    "",
    locationLine,
    ...(bookerPhone ? [`Backup phone ${bookerPhone}`] : []),
  ];
  const plainTextSummary = plainTextParts.join("\n");

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(plainTextSummary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gray-50 dark:bg-slate-900 flex items-start sm:items-center justify-center pt-[15px] px-4 pb-4 sm:p-4">
      <style>{`
        @keyframes checkmark-squish {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.12); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes circle-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes circle-fill-pop {
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes check-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes shimmer-sweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes card-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .checkmark-wrapper {
          animation: checkmark-squish 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .circle-fill {
          opacity: 0;
          transform: scale(0.8);
          transform-origin: center;
          animation: circle-fill-pop 0.4s ease-out 0.3s forwards;
        }
        .checkmark-circle {
          fill: none;
          stroke: #4285F4;
          stroke-width: 2;
          stroke-dasharray: 160;
          stroke-dashoffset: 160;
          animation: circle-draw 0.7s ease-out forwards;
        }
        .checkmark-check {
          fill: none;
          stroke: white;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: check-draw 0.5s ease-out 0.5s forwards;
        }
        .checkmark-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%);
          background-size: 200% 100%;
          border-radius: 50%;
          mix-blend-mode: screen;
          animation: shimmer-sweep 1.5s ease-in-out 1.2s forwards;
          pointer-events: none;
        }
        .confirmation-card {
          animation: card-fade-up 0.4s ease both;
        }
      `}</style>

      <div className="confirmation-card w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 text-center">
        {/* Animated checkmark */}
        <div className="checkmark-wrapper relative mx-auto mb-4" style={{ width: 80, height: 80 }}>
          <div className="checkmark-shimmer" />
          <svg viewBox="0 0 52 52" width="80" height="80">
            <circle className="circle-fill" cx="26" cy="26" r="25" fill="#4285F4" />
            <circle className="checkmark-circle" cx="26" cy="26" r="25" />
            <path className="checkmark-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 mb-1">
          You&rsquo;re booked.
        </h1>
        <p className="text-gray-500 dark:text-slate-400 mb-5 text-sm">
          {hostName} will see you on {dateStr} at {timeStr} {tzAbbr}.
        </p>

        {emailFailed && (
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-left text-sm text-amber-800 dark:text-amber-300">
            Your booking is confirmed — we just had trouble sending the confirmation email. Here are your details.
          </div>
        )}

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 text-left mb-5 space-y-2">
          {attendeeNames && <Row label="Attendees">{attendeeNames}</Row>}
          {description && <Row label="Agenda">{description}</Row>}
          <Row label="When">{ordinalDateStr} at {timeStr} {tzAbbr}</Row>
          <Row label="Duration">{duration} minutes</Row>
          <Row label="Location">{locationLine}</Row>
          {bookerPhone && <Row label="Phone">Backup phone {bookerPhone}</Row>}
        </div>

        {/* Calendar buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-2.5">
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Google Calendar
          </a>
          <button
            onClick={() => {
              downloadIcs(icsContent);
              posthog.capture("ics_downloaded", { duration_minutes: duration, location_type: locationType });
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Apple / Outlook (.ics)
          </button>
        </div>

        {/* Share + reset */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={handleCopy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            {copied ? "Copied to clipboard" : "Copy details to clipboard"}
          </button>
          <button
            onClick={onReset}
            className="flex-1 px-4 py-2.5 rounded-lg text-gray-500 dark:text-slate-400 text-sm hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
          >
            Book another appointment
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-500 dark:text-slate-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-slate-100 min-w-0 break-all">{children}</span>
    </div>
  );
}
