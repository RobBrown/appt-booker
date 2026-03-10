const MAX_DESC = 500;

interface AgendaSectionProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
}

export function AgendaSection({ description, onDescriptionChange }: AgendaSectionProps) {
  return (
    <div>
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value.slice(0, MAX_DESC))}
        placeholder="Share any agenda items, questions, or context that would help make this meeting productive…"
        rows={4}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
      <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500 text-right">
        {description.length}/{MAX_DESC}
      </p>
    </div>
  );
}
