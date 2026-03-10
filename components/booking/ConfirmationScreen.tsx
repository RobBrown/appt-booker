"use client";

import { useState } from "react";
import { addMinutes } from "date-fns";
import { format } from "date-fns-tz";

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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-slate-700 text-center"
        style={{ animation: "fadeUp 0.4s ease both" }}
      >
        {/* Animated checkmark */}
        <div
          className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-6"
          style={{ animation: "scaleIn 0.4s ease both" }}
        >
          <svg
            className="w-10 h-10 text-blue-600 dark:text-blue-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline
              points="20 6 9 17 4 12"
              style={{
                strokeDasharray: 25,
                strokeDashoffset: 25,
                animation: "drawStroke 0.4s ease 0.3s both",
              }}
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 mb-2">
          You&rsquo;re booked.
        </h1>
        <p className="text-gray-500 dark:text-slate-400 mb-8">
          {hostName} will see you on {dateStr} at {timeStr} {tzAbbr}.
        </p>

        {emailFailed && (
          <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-left text-sm text-amber-800 dark:text-amber-300">
            Your booking is confirmed — we just had trouble sending the confirmation email. Here are your details.
          </div>
        )}

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 text-left mb-8 space-y-2">
          {attendeeNames && <Row label="Attendees">{attendeeNames}</Row>}
          {description && <Row label="Agenda">{description}</Row>}
          <Row label="When">{ordinalDateStr} at {timeStr} {tzAbbr}</Row>
          <Row label="Duration">{duration} minutes</Row>
          <Row label="Location">{locationLine}</Row>
          {bookerPhone && <Row label="Phone">Backup phone {bookerPhone}</Row>}
        </div>

        {/* Calendar buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Google Calendar
          </a>
          <button
            onClick={() => downloadIcs(icsContent)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Apple / Outlook (.ics)
          </button>
        </div>

        {/* Share + reset */}
        <div className="flex flex-col sm:flex-row gap-3">
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
