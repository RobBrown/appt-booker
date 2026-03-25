"use client";

import { format } from "date-fns-tz";

const MEETING_LABELS: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  phone: "Phone Call",
  "in-person": "In Person",
  webex: "WebEx",
  jitsi: "Jitsi",
};

interface SummaryPanelProps {
  duration: number | null;
  selectedDate: string | null;
  selectedTime: string | null;
  timezone: string;
  locationType: string;
  locationDetails: string;
  bookerName: string;
  bookerPhone: string;
  description: string;
  attendees: Array<{ name: string; email: string }>;
  hostName: string;
}

export function SummaryPanel({
  duration,
  selectedDate,
  selectedTime,
  timezone,
  locationType,
  locationDetails,
  bookerName,
  bookerPhone,
  description,
  attendees,
  hostName,
}: SummaryPanelProps) {
  const hasAny = duration || selectedDate || selectedTime || bookerName || description || locationDetails || bookerPhone || attendees.length > 0;
  if (!hasAny) return null;

  const dateTimeStr = (() => {
    if (!selectedDate || !selectedTime) return null;
    const [h, m] = selectedTime.split(":").map(Number);
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return format(d, "EEE, MMM do 'at' h:mm a", { timeZone: timezone });
  })();

  const tzAbbr = (() => {
    if (!timezone) return "";
    try {
      return (
        new Intl.DateTimeFormat("en", {
          timeZone: timezone,
          timeZoneName: "short",
        })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value ?? ""
      );
    } catch {
      return "";
    }
  })();

  const label = MEETING_LABELS[locationType] ?? locationType;
  const locationLine = locationDetails ? `${label}, ${locationDetails}` : label;

  const attendeeNames = [
    ...(bookerName ? [bookerName] : []),
    ...attendees.map((a) => a.name).filter(Boolean),
    hostName,
  ].join(", ");

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/80">
        <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
          Booking Summary
        </h2>
      </div>
      <div className="px-5 py-5 space-y-2.5 text-sm">
        {attendeeNames && (
          <Row label="Attendees">{attendeeNames}</Row>
        )}
        {description && (
          <Row label="Agenda">{description}</Row>
        )}
        {dateTimeStr && (
          <Row label="When">
            {dateTimeStr} {tzAbbr}
          </Row>
        )}
        {duration && (
          <Row label="Length">{duration} minutes</Row>
        )}
        {locationType && <Row label="Location">{locationLine}</Row>}
        {bookerPhone && (
          <Row label="Phone">Backup phone {bookerPhone}</Row>
        )}
      </div>
    </div>
  );
}


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-400 dark:text-slate-500 w-16 flex-shrink-0 text-xs font-medium uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span className="text-gray-900 dark:text-slate-100 min-w-0 break-all">{children}</span>
    </div>
  );
}
