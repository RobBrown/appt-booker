"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMonths,
  format,
  getDay,
  getDaysInMonth,
  isBefore,
  isToday,
  startOfToday,
  subMonths,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { TIMEZONES } from "@/lib/timezones";

const HOST_TIMEZONE = "America/Toronto";

const BANDS: Array<(h: number) => boolean> = [
  (h) => h < 9,
  (h) => h >= 9 && h < 11,
  (h) => h >= 12 && h < 13,
  (h) => h >= 14 && h < 17,
  (h) => h >= 17,
];

function pickRepresentativeSlots(
  slots: string[],
  selectedDate: string,
  userTimezone: string
): string[] {
  const halfHour = slots.filter((s) => s.endsWith(":00") || s.endsWith(":30"));

  const withEastern = halfHour.map((slot) => {
    const utc = fromZonedTime(`${selectedDate}T${slot}:00`, userTimezone);
    const east = toZonedTime(utc, HOST_TIMEZONE);
    const easternHour = east.getHours() + east.getMinutes() / 60;
    return { slot, easternHour };
  });

  const selected = new Set<string>();
  const representative: string[] = [];
  for (const band of BANDS) {
    const match = withEastern.find(({ slot, easternHour }) => !selected.has(slot) && band(easternHour));
    if (match) {
      representative.push(match.slot);
      selected.add(match.slot);
    }
  }

  if (representative.length < 5) {
    for (const { slot } of withEastern) {
      if (!selected.has(slot)) {
        representative.push(slot);
        selected.add(slot);
        if (representative.length >= 5) break;
      }
    }
  }

  return representative.sort();
}

interface DateTimeStepProps {
  duration: number;
  selectedDate: string | null;
  selectedTime: string | null;
  timezone: string;
  calendarYear: number;
  calendarMonth: number;
  availableDates: Set<string>;
  next4: string[];
  slots: string[];
  slotsLoading: boolean;
  datesLoading: boolean;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  onTimezoneChange: (tz: string) => void;
  onCalendarNav: (year: number, month: number) => void;
}

function formatSlot(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const startPad = getDay(firstDay);
  const daysInMonth = getDaysInMonth(firstDay);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-gray-200 dark:bg-slate-700 rounded animate-pulse ${className ?? ""}`} />
  );
}

export function DateTimeStep({
  duration,
  selectedDate,
  selectedTime,
  timezone,
  calendarYear,
  calendarMonth,
  availableDates,
  next4,
  slots,
  slotsLoading,
  datesLoading,
  onDateSelect,
  onTimeSelect,
  onTimezoneChange,
  onCalendarNav,
}: DateTimeStepProps) {
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);
  const today = startOfToday();

  const weeks = getMonthGrid(calendarYear, calendarMonth);
  const monthName = format(new Date(calendarYear, calendarMonth, 1), "MMMM yyyy");

  const filteredTz = tzSearch
    ? TIMEZONES.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase())).slice(0, 10)
    : TIMEZONES.slice(0, 10);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setTzOpen(false);
        setTzSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDaySelect = (date: Date) => {
    const str = format(date, "yyyy-MM-dd");
    onDateSelect(str);
    setShowAllSlots(false);
    if (date.getFullYear() !== calendarYear || date.getMonth() !== calendarMonth) {
      onCalendarNav(date.getFullYear(), date.getMonth());
    }
  };

  const tzAbbr = (() => {
    try {
      return (
        new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value ?? timezone
      );
    } catch {
      return timezone;
    }
  })();

  // First available date in current view (for "next" badge)
  const allCells = weeks.filter(Boolean) as Date[];
  const firstAvailableInView = allCells.find(
    (d) => availableDates.has(format(d, "yyyy-MM-dd"))
  );
  const todayStr = format(today, "yyyy-MM-dd");
  const todayAvailable = availableDates.has(todayStr);

  return (
    <div className="space-y-5">
      {/* Timezone selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" ref={tzRef}>
          {tzOpen ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                placeholder="Search timezone…"
                className="text-sm px-3 py-1.5 rounded-lg border border-blue-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 outline-none w-56"
              />
              <button
                onClick={() => { setTzOpen(false); setTzSearch(""); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 text-xs"
              >
                Cancel
              </button>
              <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg z-50 overflow-y-auto max-h-52">
                {filteredTz.map((tz) => (
                  <button
                    key={tz}
                    onClick={() => { onTimezoneChange(tz); setTzOpen(false); setTzSearch(""); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 ${tz === timezone ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-slate-300"}`}
                  >
                    {tz}
                  </button>
                ))}
                {filteredTz.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400 dark:text-slate-500">No results</div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setTzOpen(true)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
              aria-label={`Current timezone: ${timezone}. Click to change.`}
            >
              <span>Your time zone: <span className="font-medium text-gray-900 dark:text-slate-100">{tzAbbr}</span></span>
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Next 4 available days strip */}
      <div>
        {datesLoading ? (
          <div className="grid grid-cols-4 gap-2 py-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : next4.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 py-1" role="list" aria-label="Next available days">
            {next4.map((dateStr) => {
              const date = new Date(dateStr + "T00:00:00");
              const isSelected = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  role="listitem"
                  onClick={() => handleDaySelect(date)}
                  aria-pressed={isSelected}
                  className={`px-2 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 text-center ${
                    isSelected
                      ? "bg-blue-600 dark:bg-blue-500 text-white"
                      : "bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600"
                  }`}
                >
                  {format(date, "EEE MMM d")}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Calendar grid + time slots */}
      <div className="flex flex-col md:flex-row gap-5">
        {/* Calendar */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                const prev = subMonths(new Date(calendarYear, calendarMonth, 1), 1);
                onCalendarNav(prev.getFullYear(), prev.getMonth());
              }}
              aria-label="Previous month"
              disabled={datesLoading}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {monthName}
            </span>
            <button
              onClick={() => {
                const next = addMonths(new Date(calendarYear, calendarMonth, 1), 1);
                onCalendarNav(next.getFullYear(), next.getMonth());
              }}
              aria-label="Next month"
              disabled={datesLoading}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-slate-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells — skeleton while loading */}
          {datesLoading ? (
            <div className="grid grid-cols-7 gap-y-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="flex justify-center">
                  <Skeleton className="w-8 h-8 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-y-1">
              {weeks.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} />;
                const dateStr = format(day, "yyyy-MM-dd");
                const isPast = isBefore(day, today);
                const isAvailable = availableDates.has(dateStr);
                const isSelected = selectedDate === dateStr;
                const isTodayDate = isToday(day);
                const isFirstAvailable =
                  !todayAvailable &&
                  firstAvailableInView &&
                  dateStr === format(firstAvailableInView, "yyyy-MM-dd");
                const isDisabled = isPast || !isAvailable;

                return (
                  <div key={dateStr} className="flex flex-col items-center">
                    <button
                      onClick={() => !isDisabled && handleDaySelect(day)}
                      disabled={isDisabled}
                      aria-label={`${format(day, "MMMM d, yyyy")}${isAvailable ? ", available" : ", unavailable"}`}
                      aria-pressed={isSelected}
                      className={`w-9 h-9 rounded-full text-sm font-medium transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 ${
                        isSelected
                          ? "bg-blue-600 dark:bg-blue-500 text-white"
                          : isDisabled
                          ? "text-gray-300 dark:text-slate-600 cursor-not-allowed"
                          : isTodayDate
                          ? "text-blue-600 dark:text-blue-400 font-semibold underline underline-offset-2 hover:bg-gray-100 dark:hover:bg-slate-700"
                          : "text-gray-900 dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                    {isAvailable && !isSelected && (
                      <div className="w-1 h-1 rounded-full bg-blue-400 dark:bg-blue-500 mt-0.5" />
                    )}
                    {isFirstAvailable && (
                      <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium -mt-0.5 whitespace-nowrap">
                        next
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Time slots */}
        {selectedDate ? (
          <div className="md:w-44 space-y-1.5">
            {slotsLoading ? (
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </>
            ) : slots.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center pt-2">
                No available times for this day.
              </p>
            ) : (
              (() => {
                const filteredSlots = slots.filter((s) => s.endsWith(":00") || s.endsWith(":30"));
                const representative = selectedDate
                  ? pickRepresentativeSlots(slots, selectedDate, timezone)
                  : filteredSlots.slice(0, 5);
                const visible = showAllSlots ? filteredSlots : representative;
                const hasMore = !showAllSlots && filteredSlots.length > representative.length;
                return (
                  <>
                    {visible.map((slot) => {
                      const isSelected = selectedTime === slot;
                      return (
                        <button
                          key={slot}
                          onClick={() => onTimeSelect(slot)}
                          aria-pressed={isSelected}
                          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900 ${
                            isSelected
                              ? "bg-blue-600 dark:bg-blue-500 text-white"
                              : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400"
                          }`}
                        >
                          {formatSlot(slot)}
                        </button>
                      );
                    })}
                    {hasMore && !showAllSlots && (
                      <button
                        onClick={() => setShowAllSlots(true)}
                        className="w-full py-2.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      >
                        More times available
                      </button>
                    )}
                    {selectedTime && (
                      <p className="sr-only" aria-live="polite">
                        {formatSlot(selectedTime)} selected
                      </p>
                    )}
                  </>
                );
              })()
            )}
          </div>
        ) : (
          <div className="md:w-44 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500 text-center">
            Select a date to see available times
          </div>
        )}
      </div>
    </div>
  );
}
