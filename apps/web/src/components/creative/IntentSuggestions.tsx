'use client';

/** Raivstream 5.0 — one-tap intent suggestions for /create. */
export function IntentSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (suggestion: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          className="rounded-full border border-[rgba(233,233,237,0.14)] px-3 py-1 text-xs font-semibold text-[var(--noc-t4)] hover:border-[var(--noc-purple)] hover:text-[var(--noc-t1)]"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}