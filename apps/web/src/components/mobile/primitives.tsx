'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shared building blocks for the /m mobile UI (design handoff:
 * design_handoff_raivstream_mobile). These are intentionally small and
 * un-fancy — the codebase has no generic UI primitive library yet, so this
 * file is the first one, scoped to exactly what the 8 mobile screens need.
 * Every color/radius/spacing value here traces back to the handoff's README
 * "Design Tokens" section and the Nocturne tokens already in globals.css.
 */

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="noc-card"
      style={{ borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, ...style }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="noc-label">{children}</p>;
}

/** Horizontally-scrolling row of pill options; single-select. Used by Scene
 * Director's control groups and the Assets filter chips. */
export function SegRow({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string | undefined;
  onChange: (option: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }} className="hide-scrollbar">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`noc-seg${value === option ? ' active' : ''}`}
        >
          {optionLabel(option)}
        </button>
      ))}
    </div>
  );
}

/** ENUM_CASE -> "Enum case" for display. */
export function optionLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'ready' | 'generating' | 'draft' | 'failed';
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: 'rgba(233,233,237,0.06)', fg: 'var(--noc-t4)' },
    accent: { bg: 'rgba(178,90,217,0.14)', fg: 'var(--noc-lavender-tint)' },
    ready: { bg: 'rgba(79,214,232,0.14)', fg: 'var(--noc-cyan-tint)' },
    generating: { bg: 'rgba(217,70,168,0.16)', fg: 'var(--noc-pink-tint)' },
    draft: { bg: 'rgba(233,233,237,0.08)', fg: 'var(--noc-t4)' },
    failed: { bg: 'rgba(227,93,93,0.16)', fg: '#e35d5d' },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Progressive-disclosure accordion section — Character detail's 7 fields. */
export function Accordion({
  label,
  hint,
  body,
  chips,
  defaultOpen = false,
}: {
  label: string;
  hint: string;
  body: string;
  chips: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--noc-rule)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          padding: '10px 0',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--noc-t1)' }}>{label}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--noc-t6)' }}>{hint}</span>
        </span>
        <span style={{ fontSize: 16, color: 'var(--noc-t5)', flexShrink: 0, marginLeft: 12 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 14, lineHeight: 1.62, color: 'var(--noc-t3)', margin: 0 }}>{body}</p>
          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chips.map((chip) => (
                <span
                  key={chip}
                  style={{ fontSize: 11.5, borderRadius: 999, padding: '4px 10px', background: 'rgba(233,233,237,0.06)', color: 'var(--noc-t4)' }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--noc-t3)', margin: 0 }}>{title}</p>
      {hint && <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', marginTop: 6 }}>{hint}</p>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8 }: { height?: number; width?: string | number; radius?: number }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(233,233,237,0.04), rgba(233,233,237,0.08), rgba(233,233,237,0.04))',
        backgroundSize: '200% 100%',
        animation: 'noc-shimmer 1.4s ease-in-out infinite',
      }}
    />
  );
}

/** Cosmetic pacing for a real, blocking scene-image-generation mutation.
 * The four steps/timings/copy are the design handoff's own — this never
 * fabricates a result, it only paces the wait for a real one. If the real
 * mutation resolves before the schedule finishes, the caller should jump
 * straight to the "review" state; if it resolves after, this holds at the
 * final step's copy/percentage until told to stop. */
const GENERATE_STEPS: Array<{ ms: number; label: string; pct: number }> = [
  { ms: 0, label: 'Preparing your scene…', pct: 12 },
  { ms: 900, label: 'Creating the image…', pct: 46 },
  { ms: 2100, label: 'Checking continuity…', pct: 78 },
  { ms: 3100, label: 'Almost ready…', pct: 94 },
];

export function useGenerateProgress() {
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [pct, setPct] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function start() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(true);
    setPct(0);
    setLabel(GENERATE_STEPS[0].label);
    for (const step of GENERATE_STEPS) {
      const t = setTimeout(() => {
        setLabel(step.label);
        setPct(step.pct);
      }, step.ms);
      timers.current.push(t);
    }
  }

  function finish() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(false);
    setPct(100);
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { running, label, pct, start, finish };
}
