interface Duration {
  minutes: number;
  label: string;
  hint: string;
}

interface DurationStepProps {
  selected: number | null;
  onSelect: (duration: number) => void;
  durations: Duration[];
}

export function DurationStep({ selected, onSelect, durations }: DurationStepProps) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {durations.map((d) => {
          const isSelected = selected === d.minutes;
          return (
            <button
              key={d.minutes}
              onClick={() => onSelect(d.minutes)}
              aria-pressed={isSelected}
              className={`p-4 rounded-xl border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/50"
                  : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-750"
              }`}
            >
              <div
                className={`font-semibold text-base ${
                  isSelected
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-900 dark:text-slate-100"
                }`}
              >
                {d.label}
              </div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{d.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
