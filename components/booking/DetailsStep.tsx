"use client";

import { Plus, Trash2 } from "lucide-react";

const LOCATION_OPTIONS = [
  { value: "in-person", label: "In Person", icon: "🏢" },
  { value: "phone", label: "Phone Call", icon: "📞" },
  { value: "zoom", label: "Zoom", icon: "💻" },
  { value: "google-meet", label: "Google Meet", icon: "🎥" },
  { value: "webex", label: "WebEx", icon: "📡" },
  { value: "jitsi", label: "Jitsi", icon: "🔗" },
] as const;

interface Attendee {
  name: string;
  email: string;
}

interface DetailsStepProps {
  locationType: string;
  locationDetails: string;
  attendees: Attendee[];
  description: string;
  bookerName: string;
  bookerEmail: string;
  nameError: string;
  emailError: string;
  topicChips: string[];
  defaultAddress: string;
  onLocationTypeChange: (type: string) => void;
  onLocationDetailsChange: (details: string) => void;
  onAttendeesChange: (attendees: Attendee[]) => void;
  onDescriptionChange: (desc: string) => void;
  onBookerNameChange: (name: string) => void;
  onBookerEmailChange: (email: string) => void;
}

const MAX_ATTENDEES = 10;
const MAX_DESC = 500;

export function DetailsStep({
  locationType,
  locationDetails,
  attendees,
  description,
  bookerName,
  bookerEmail,
  nameError,
  emailError,
  topicChips,
  defaultAddress,
  onLocationTypeChange,
  onLocationDetailsChange,
  onAttendeesChange,
  onDescriptionChange,
  onBookerNameChange,
  onBookerEmailChange,
}: DetailsStepProps) {
  const addAttendee = () => {
    if (attendees.length >= MAX_ATTENDEES) return;
    onAttendeesChange([...attendees, { name: "", email: "" }]);
  };

  const removeAttendee = (i: number) => {
    onAttendeesChange(attendees.filter((_, idx) => idx !== i));
  };

  const updateAttendee = (i: number, field: keyof Attendee, value: string) => {
    onAttendeesChange(
      attendees.map((a, idx) => (idx === i ? { ...a, [field]: value } : a))
    );
  };

  const appendChip = (chip: string) => {
    const sep = description.trim() ? " " : "";
    onDescriptionChange((description + sep + chip).slice(0, MAX_DESC));
  };

  const showAddressField = locationType === "in-person";
  const showPhoneField = locationType === "phone";
  const showLinkField = ["zoom", "webex", "jitsi"].includes(locationType);

  return (
    <div className="space-y-6">
      {/* Location type */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          How should we meet?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LOCATION_OPTIONS.map((opt) => {
            const isSelected = locationType === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onLocationTypeChange(opt.value);
                  if (opt.value === "in-person" && !locationDetails) {
                    onLocationDetailsChange(defaultAddress);
                  }
                }}
                aria-pressed={isSelected}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
                }`}
              >
                <span className="text-xl leading-none">{opt.icon}</span>
                <span className="text-xs leading-tight">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conditional location field */}
      {(showAddressField || showPhoneField || showLinkField) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            {showAddressField && "Address"}
            {showPhoneField && "Your phone number"}
            {showLinkField && "Meeting link (optional)"}
          </label>
          <input
            type={showPhoneField ? "tel" : "text"}
            value={locationDetails}
            onChange={(e) => onLocationDetailsChange(e.target.value)}
            placeholder={
              showAddressField
                ? defaultAddress || "123 Main St, City, State"
                : showPhoneField
                ? "+1 (555) 000-0000"
                : "https://…"
            }
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Your info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Your name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={bookerName}
            onChange={(e) => onBookerNameChange(e.target.value)}
            placeholder="Full name"
            className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              nameError
                ? "border-red-400 dark:border-red-500"
                : "border-gray-200 dark:border-slate-700"
            }`}
          />
          {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={bookerEmail}
            onChange={(e) => onBookerEmailChange(e.target.value)}
            placeholder="you@example.com"
            className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              emailError
                ? "border-red-400 dark:border-red-500"
                : "border-gray-200 dark:border-slate-700"
            }`}
          />
          {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
        </div>
      </div>

      {/* Additional attendees */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Additional attendees{" "}
            <span className="text-gray-400 dark:text-slate-500 font-normal">(optional)</span>
          </p>
          {attendees.length < MAX_ATTENDEES && (
            <button
              onClick={addAttendee}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add person
            </button>
          )}
        </div>

        {attendees.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">
            <button
              onClick={addAttendee}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add someone else?
            </button>
          </p>
        ) : (
          <div className="space-y-2">
            {attendees.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateAttendee(i, "name", e.target.value)}
                    placeholder="Name"
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="email"
                    value={a.email}
                    onChange={(e) => updateAttendee(i, "email", e.target.value)}
                    placeholder="Email"
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => removeAttendee(i)}
                  aria-label="Remove attendee"
                  className="mt-2.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
          What&rsquo;s this about?{" "}
          <span className="text-gray-400 dark:text-slate-500 font-normal">(optional)</span>
        </label>

        {topicChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {topicChips.map((chip) => (
              <button
                key={chip}
                onClick={() => appendChip(chip)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value.slice(0, MAX_DESC))}
          placeholder="Brief agenda, questions, or context…"
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-500 text-right">
          {description.length}/{MAX_DESC}
        </p>
      </div>
    </div>
  );
}
