"use client";

import { Plus, Trash2 } from "lucide-react";

interface Attendee {
  name: string;
  email: string;
}

interface AttendeesSectionProps {
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  nameError: string;
  emailError: string;
  attendees: Attendee[];
  onBookerNameChange: (name: string) => void;
  onBookerEmailChange: (email: string) => void;
  onBookerPhoneChange: (phone: string) => void;
  onAttendeesChange: (attendees: Attendee[]) => void;
}

const MAX_ATTENDEES = 10;

export function AttendeesSection({
  bookerName,
  bookerEmail,
  bookerPhone,
  nameError,
  emailError,
  attendees,
  onBookerNameChange,
  onBookerEmailChange,
  onBookerPhoneChange,
  onAttendeesChange,
}: AttendeesSectionProps) {
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

  return (
    <div className="space-y-4">
      {/* Name + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Attendee name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={bookerName}
            onChange={(e) => onBookerNameChange(e.target.value)}
            placeholder="First Last"
            className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              nameError
                ? "border-red-400 dark:border-red-500"
                : "border-gray-200 dark:border-slate-700"
            }`}
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-500">{nameError}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Email address <span className="text-red-500">*</span>
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
          {emailError && (
            <p className="mt-1 text-xs text-red-500">{emailError}</p>
          )}
        </div>
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
          Phone number
        </label>
        <input
          type="tel"
          value={bookerPhone}
          onChange={(e) => onBookerPhoneChange(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
          Used as a backup contact method
        </p>
      </div>

      {/* Additional attendees */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Additional attendees
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
          <button
            onClick={addAttendee}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Add someone else?
          </button>
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
    </div>
  );
}
