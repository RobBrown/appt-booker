"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

const ZoomLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#2D8CFF" />
    <rect x="4.5" y="7.5" width="9.5" height="9" rx="1.5" fill="white" />
    <path d="M14 11.2L20 8v8l-6-2.8V11.2z" fill="white" />
  </svg>
);

const GoogleMeetLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 9C4 7.9 4.9 7 6 7H13V17H6C4.9 17 4 16.1 4 15V9Z" fill="#00832D" />
    <path d="M13 7H15.7L21 10.5V13.5L15.7 17H13V7Z" fill="#0066DA" />
    <path d="M15.7 7L21 10.5V7H15.7Z" fill="#EA4335" />
    <path d="M21 13.5L15.7 17H21V13.5Z" fill="#FBBC04" />
    <path d="M13 7H15.7L13 9.5V7Z" fill="#00A94F" />
    <path d="M13 17H15.7L13 14.5V17Z" fill="#00832D" />
  </svg>
);

const WebexLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#00BCEB" />
    <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Arial, sans-serif">Wx</text>
  </svg>
);

const JitsiLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#1E3050" />
    <circle cx="12" cy="9" r="3.5" fill="#97C0F5" />
    <path d="M6 19c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="#97C0F5" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const LOCATION_OPTIONS: Array<{ value: string; label: string; icon: ReactNode }> = [
  { value: "in-person", label: "In Person", icon: "🏢" },
  { value: "phone", label: "Phone Call", icon: "📞" },
  { value: "zoom", label: "Zoom", icon: <ZoomLogo /> },
  { value: "google-meet", label: "Google Meet", icon: <GoogleMeetLogo /> },
  { value: "webex", label: "WebEx", icon: <WebexLogo /> },
  { value: "jitsi", label: "Jitsi", icon: <JitsiLogo /> },
];

// Providers where the details field is required
const REQUIRES_LINK = new Set(["zoom", "google-meet", "webex", "jitsi"]);
// Providers that support auto-creation via API
const AUTO_CREATE_PROVIDERS = new Set(["zoom", "google-meet", "jitsi"]);
const AUTO_CREATE_LABEL: Record<string, string> = {
  zoom: "Zoom",
  "google-meet": "Google Meet",
  jitsi: "Jitsi",
};

const DETAIL_CONFIG: Record<
  string,
  { label: string; placeholder: string; multiline?: boolean }
> = {
  "in-person": {
    label: "Address and entry instructions",
    placeholder: "123 Main St, Suite 200\nCity, Province\nEntry instructions (e.g. buzz unit 42, ask for reception)",
    multiline: true,
  },
  phone: {
    label: "Phone number the host should call",
    placeholder: "+1 (555) 000-0000",
  },
  zoom: {
    label: "Zoom meeting details",
    placeholder: "Meeting link",
  },
  "google-meet": {
    label: "Google Meet details",
    placeholder: "Add your meeting link or click add to create one",
  },
  webex: {
    label: "Webex conference bridge",
    placeholder: "Conference bridge link or ID",
  },
  jitsi: {
    label: "Jitsi meeting details",
    placeholder: "Meeting URL",
  },
};

interface LocationSectionProps {
  locationType: string;
  locationDetails: string;
  hostFirstName: string;
  duration: number | null;
  selectedDate: string | null;
  selectedTime: string | null;
  timezone: string;
  onLocationTypeChange: (type: string) => void;
  onLocationDetailsChange: (details: string) => void;
  onServiceUnavailable?: () => void;
}

export function LocationSection({
  locationType,
  locationDetails,
  hostFirstName,
  duration,
  selectedDate,
  selectedTime,
  timezone,
  onLocationTypeChange,
  onLocationDetailsChange,
  onServiceUnavailable,
}: LocationSectionProps) {
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [savedDetails, setSavedDetails] = useState<Record<string, string>>({});

  const config = DETAIL_CONFIG[locationType];
  const requiresLink = REQUIRES_LINK.has(locationType);
  const canAutoCreate = AUTO_CREATE_PROVIDERS.has(locationType);
  const providerLabel = AUTO_CREATE_LABEL[locationType];

  const handleTypeChange = (type: string) => {
    // Save current details for the outgoing provider, restore for the incoming one
    setSavedDetails((prev) => ({ ...prev, [locationType]: locationDetails }));
    onLocationTypeChange(type);
    onLocationDetailsChange(savedDetails[type] ?? "");
    setMeetingError(null);
  };

  const handleGenerateMeeting = async () => {
    setMeetingLoading(true);
    setMeetingError(null);
    try {
      const res = await fetch("/api/meetings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: locationType,
          duration,
          selectedDate,
          selectedTime,
          timezone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "RATE_LIMIT_SERVICE_DOWN") {
          onServiceUnavailable?.();
        }
        throw new Error("Failed");
      }
      onLocationDetailsChange(data.url);
    } catch {
      setMeetingError("Couldn't create a meeting. Please enter the link manually.");
    } finally {
      setMeetingLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {LOCATION_OPTIONS.map((opt) => {
          const isSelected = locationType === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleTypeChange(opt.value)}
              aria-pressed={isSelected}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
              }`}
            >
              <span className="text-xl leading-none flex items-center justify-center">{opt.icon}</span>
              <span className="text-xs leading-tight text-center">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {config && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {locationType === "phone"
                ? `Phone number ${hostFirstName} should call`
                : config.label}
              {requiresLink && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {canAutoCreate && (
              <button
                onClick={handleGenerateMeeting}
                disabled={meetingLoading}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {meetingLoading
                  ? "Creating…"
                  : locationDetails
                  ? `Regenerate`
                  : `Add ${providerLabel} Meeting`}
              </button>
            )}
          </div>

          {config.multiline ? (
            <textarea
              value={locationDetails}
              onChange={(e) => onLocationDetailsChange(e.target.value)}
              placeholder={config.placeholder}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          ) : (
            <input
              type={locationType === "phone" ? "tel" : "text"}
              value={locationDetails}
              onChange={(e) => onLocationDetailsChange(e.target.value)}
              placeholder={config.placeholder}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {meetingError && (
            <p className="mt-1.5 text-xs text-red-500">{meetingError}</p>
          )}
        </div>
      )}
    </div>
  );
}
