'use client';

import { useState } from 'react';
import { IntentSuggestions } from './IntentSuggestions';

const SUGGESTIONS = ['Tell a story', 'Teach something', 'Promote something', 'Transform something'];
const ATTACHMENTS = ['Image', 'Video', 'Script', 'Audio', 'Product'];

export function CreativeInput({
  text,
  onChange,
  onSubmit,
  disabled,
}: {
  text: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const canSubmit = text.trim().length > 3 && !disabled;

  return (
    <div
      className="rounded-2xl border p-5 transition-colors"
      style={{
        borderColor: focused ? 'var(--noc-purple)' : 'rgba(233,233,237,0.1)',
        background: 'rgba(233,233,237,0.03)',
      }}
    >
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={4}
        placeholder="Tell Raivstream what you're imagining..."
        className="w-full resize-none bg-transparent text-lg text-[var(--noc-t1)] outline-none placeholder:text-[var(--noc-t6)]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <IntentSuggestions
          suggestions={SUGGESTIONS}
          onPick={(suggestion) => onChange(suggestion.toLowerCase().endsWith('?') ? suggestion : suggestion)}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="ml-auto rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-2.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Interpret
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[rgba(233,233,237,0.08)] pt-3">
        <span className="text-xs font-bold text-[var(--noc-t6)]">Attach:</span>
        {ATTACHMENTS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(text ? `${text} (reference: ${label.toLowerCase()})` : label)}
            className="rounded-full border border-[rgba(233,233,237,0.14)] px-3 py-1 text-xs font-semibold text-[var(--noc-t4)] hover:border-[var(--noc-purple)]"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}