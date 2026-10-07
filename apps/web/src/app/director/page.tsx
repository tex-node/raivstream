'use client';

import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type Purpose = 'CHARACTER' | 'ENVIRONMENT' | 'PROP' | 'OTHER';
type CastRow = { tag: string; description: string; voice: string; imageReferenced: boolean };
type RefRow = { label: string; purpose: Purpose; note: string };
type Ceiling = 2000 | 4000;
type Format = 'CONTINUOUS' | 'CUTS';

type DirectedScene = { index: number; prompt: string; charCount: number; withinCeiling: boolean };

const AI_STUDIO_LIMIT = 2000;

const QUICK_NOTES = [
  'Too short',
  'Too floaty',
  'Feels fake or over-acted',
  'Eyes look dead',
  'Background too busy',
  'Background too plain',
  'Looks like a statue',
  'Repeating itself',
];

const inputCls =
  'w-full bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-4 py-2.5 text-[var(--noc-t1)] placeholder-[var(--noc-t6)] text-sm focus:outline-none focus:border-[var(--noc-magenta)]/60 transition-colors';
const labelCls = 'text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2';

function Segmented<T extends string | number>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`text-left rounded-xl border px-4 py-3 transition-all ${
            value === o.value
              ? 'border-[#d946a8] bg-[rgba(217,70,168,0.1)]'
              : 'border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] hover:border-[rgba(233,233,237,0.15)]'
          }`}
        >
          <span className="block font-semibold text-sm">{o.label}</span>
          <span className="block text-[var(--noc-t6)] text-xs mt-0.5">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

export default function DirectorPage() {
  const { isSignedIn, isLoaded } = useUser();

  const [scene, setScene] = useState('');
  const [world, setWorld] = useState('');
  const [cast, setCast] = useState<CastRow[]>([{ tag: '', description: '', voice: '', imageReferenced: false }]);
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [sceneCount, setSceneCount] = useState(1);
  const [format, setFormat] = useState<Format>('CONTINUOUS');
  const [ceiling, setCeiling] = useState<Ceiling>(AI_STUDIO_LIMIT);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [result, setResult] = useState<{ scenes: DirectedScene[]; warnings: string[]; creditsUsed: number; ceiling: Ceiling } | null>(null);

  const status = trpc.director.status.useQuery(undefined, { enabled: isSignedIn, retry: false });
  const compose = trpc.director.compose.useMutation({
    onSuccess: (data) => {
      setResult({ scenes: data.scenes, warnings: data.warnings, creditsUsed: data.creditsUsed, ceiling });
      setNote('');
    },
  });

  const maxScenes = status.data?.maxScenes ?? 6;
  const creditCost = status.data?.creditCost ?? 0;
  const notConfigured = status.data && !status.data.configured;

  function payload(revision?: string) {
    return {
      scene,
      world: world.trim() || undefined,
      sceneCount,
      format,
      charCeiling: ceiling,
      cast: cast
        .filter((c) => c.tag.trim())
        .map((c) => ({
          tag: c.tag.trim(),
          description: c.imageReferenced ? undefined : c.description.trim() || undefined,
          voice: c.voice.trim() || undefined,
          imageReferenced: c.imageReferenced,
        })),
      references: refs.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), purpose: r.purpose, note: r.note.trim() || undefined })),
      ...(revision && result ? { revisionNote: revision, previousScenes: result.scenes.map((s) => s.prompt) } : {}),
    };
  }

  function updateCast(i: number, patch: Partial<CastRow>) {
    setCast((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateRef(i: number, patch: Partial<RefRow>) {
    setRefs((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-[var(--noc-t4)] text-lg">Sign in to use the Director</p>
        <a href="/sign-in" className="bg-[var(--noc-magenta)] hover:opacity-90 text-white px-6 py-2.5 rounded-full font-semibold transition-opacity">Sign in</a>
      </div>
    );
  }

  const canSubmit = scene.trim().length >= 10 && !compose.isPending && !notConfigured;

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-[var(--noc-magenta)] via-[var(--noc-purple)] to-[var(--noc-blue)] bg-clip-text text-transparent">
            Director
          </h1>
          <p className="text-[var(--noc-t4)] text-sm max-w-xl mx-auto">
            Describe a scene in plain words. Get back a shot-by-shot, acted, camera-ready prompt for any video model.
          </p>
        </div>

        {notConfigured && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
            The Director is not switched on yet. Add the Claude API key on the server to enable it.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Brief ── */}
          <form
            className="lg:col-span-2 bg-[var(--noc-card)] rounded-2xl border border-[var(--noc-hairline)] p-5 space-y-5 self-start"
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) compose.mutate(payload()); }}
          >
            <div>
              <label htmlFor="dir-scene" className={labelCls}>1 · The scene</label>
              <textarea
                id="dir-scene"
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="What happens, in plain language. e.g. Ada sneaks the last puff-puff from the tray while Mama Nkechi argues with a customer, then gets caught."
                className={`${inputCls} py-3 resize-y`}
              />
            </div>

            <div>
              <label htmlFor="dir-world" className={labelCls}>World <span className="normal-case text-[var(--noc-t6)]">(optional, held constant)</span></label>
              <input id="dir-world" value={world} onChange={(e) => setWorld(e.target.value)} maxLength={600}
                placeholder="e.g. Balogun market, late afternoon, harmattan haze" className={inputCls} />
            </div>

            <div>
              <span className={labelCls}>2 · Who&apos;s in it</span>
              <div className="space-y-3">
                {cast.map((c, i) => (
                  <div key={i} className="rounded-xl border border-[var(--noc-hairline)] p-3 space-y-2">
                    <div className="flex gap-2">
                      <input aria-label="Character tag" value={c.tag} onChange={(e) => updateCast(i, { tag: e.target.value })}
                        maxLength={40} placeholder="@Name" className={`${inputCls} flex-1`} />
                      <button type="button" onClick={() => setCast((rows) => rows.filter((_, idx) => idx !== i))}
                        className="px-3 text-[var(--noc-t6)] hover:text-[var(--noc-t1)] text-sm" aria-label="Remove character">✕</button>
                    </div>
                    {!c.imageReferenced && (
                      <input aria-label="Description" value={c.description} onChange={(e) => updateCast(i, { description: e.target.value })}
                        maxLength={600} placeholder="Age, build, look, what drives them" className={inputCls} />
                    )}
                    <input aria-label="Voice" value={c.voice} onChange={(e) => updateCast(i, { voice: e.target.value })}
                      maxLength={300} placeholder="Voice (optional): age, accent, pace" className={inputCls} />
                    <label className="flex items-center gap-2 text-xs text-[var(--noc-t5)] cursor-pointer">
                      <input type="checkbox" checked={c.imageReferenced} onChange={(e) => updateCast(i, { imageReferenced: e.target.checked })} className="accent-pink-500" />
                      I&apos;ll load an image reference for this character
                    </label>
                  </div>
                ))}
                {cast.length < 8 && (
                  <button type="button" onClick={() => setCast((rows) => [...rows, { tag: '', description: '', voice: '', imageReferenced: false }])}
                    className="text-[var(--noc-magenta)] text-sm font-medium">+ Add character</button>
                )}
              </div>
            </div>

            <div>
              <span className={labelCls}>Reference images <span className="normal-case text-[var(--noc-t6)]">(optional)</span></span>
              <div className="space-y-2">
                {refs.map((r, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <input aria-label="Reference name" value={r.label} onChange={(e) => updateRef(i, { label: e.target.value })}
                      maxLength={80} placeholder="Image name" className={`${inputCls} flex-1 min-w-[8rem]`} />
                    <select aria-label="Used for" value={r.purpose} onChange={(e) => updateRef(i, { purpose: e.target.value as Purpose })}
                      className={`${inputCls} w-auto`}>
                      <option value="CHARACTER">Character look</option>
                      <option value="ENVIRONMENT">Environment</option>
                      <option value="PROP">Prop</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <button type="button" onClick={() => setRefs((rows) => rows.filter((_, idx) => idx !== i))}
                      className="px-2 text-[var(--noc-t6)] hover:text-[var(--noc-t1)] text-sm" aria-label="Remove reference">✕</button>
                  </div>
                ))}
                {refs.length < 8 && (
                  <button type="button" onClick={() => setRefs((rows) => [...rows, { label: '', purpose: 'CHARACTER', note: '' }])}
                    className="text-[var(--noc-magenta)] text-sm font-medium">+ Add reference</button>
                )}
              </div>
            </div>

            <div>
              <span className={labelCls}>3 · How many scenes</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setSceneCount((n) => Math.max(1, n - 1))} aria-label="Fewer scenes"
                  className="w-9 h-9 rounded-full border border-[var(--noc-hairline)] text-lg">−</button>
                <span className="text-2xl font-bold w-8 text-center" aria-live="polite">{sceneCount}</span>
                <button type="button" onClick={() => setSceneCount((n) => Math.min(maxScenes, n + 1))} aria-label="More scenes"
                  className="w-9 h-9 rounded-full border border-[var(--noc-hairline)] text-lg">+</button>
              </div>
            </div>

            <div>
              <span className={labelCls}>Coverage</span>
              <Segmented<Format> value={format} onChange={setFormat} options={[
                { value: 'CONTINUOUS', label: 'One continuous take', hint: 'Default, most natural' },
                { value: 'CUTS', label: 'Cuts', hint: 'Inserts, reverses, montage' },
              ]} />
            </div>

            <div>
              <span className={labelCls}>Length</span>
              <Segmented<Ceiling> value={ceiling} onChange={setCeiling} options={[
                { value: 2000, label: 'Raivstream AI Studio', hint: 'Up to 2,000 characters' },
                { value: 4000, label: 'External tools', hint: 'Up to 4,000 characters' },
              ]} />
            </div>

            <button type="submit" disabled={!canSubmit}
              className="w-full bg-gradient-to-r from-[var(--noc-magenta)] to-[var(--noc-purple)] disabled:opacity-40 text-white font-semibold rounded-xl py-3 transition-opacity">
              {compose.isPending ? 'Directing…' : `Direct ${sceneCount === 1 ? 'scene' : `${sceneCount} scenes`}${creditCost > 0 ? ` · ${creditCost} credits` : ''}`}
            </button>
            {compose.error && <p className="text-sm text-red-300" role="alert">{compose.error.message}</p>}
          </form>

          {/* ── Output ── */}
          <div className="lg:col-span-3 space-y-4">
            {!result && !compose.isPending && (
              <div className="rounded-2xl border border-dashed border-[var(--noc-hairline)] p-10 text-center text-[var(--noc-t6)] text-sm">
                Your finished prompts appear here: character blocks, scene context, camera spec, the CUT list and sound design.
              </div>
            )}
            {compose.isPending && (
              <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-10 text-center text-[var(--noc-t5)] text-sm animate-pulse">
                Blocking the scene, locking the lens, rehearsing the cast…
              </div>
            )}

            {result && !compose.isPending && (
              <>
                {result.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm space-y-1">
                    {result.warnings.map((w) => <p key={w}>{w}</p>)}
                  </div>
                )}

                {result.scenes.map((s) => {
                  const fitsStudio = s.charCount <= AI_STUDIO_LIMIT;
                  return (
                    <article key={s.index} className="bg-[var(--noc-card)] rounded-2xl border border-[var(--noc-hairline)] overflow-hidden">
                      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--noc-hairline)]">
                        <h2 className="font-semibold text-sm">Scene {s.index}</h2>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          s.withinCeiling ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          {s.charCount.toLocaleString()} / {result.ceiling.toLocaleString()}
                        </span>
                        <div className="ml-auto flex gap-2">
                          <button type="button" onClick={() => copy(s.prompt, s.index)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--noc-hairline)] hover:border-[var(--noc-magenta)]/60">
                            {copied === s.index ? 'Copied' : 'Copy'}
                          </button>
                          {fitsStudio ? (
                            <a href={`/generate?mode=video&prompt=${encodeURIComponent(s.prompt)}`}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--noc-magenta)] text-white hover:opacity-90">
                              Send to AI Studio
                            </a>
                          ) : (
                            <span className="text-[10px] text-[var(--noc-t6)] self-center" title="AI Studio accepts up to 2,000 characters">Too long for AI Studio</span>
                          )}
                        </div>
                      </header>
                      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[var(--noc-t2)] p-4 max-h-[32rem] overflow-y-auto">{s.prompt}</pre>
                    </article>
                  );
                })}

                <div className="bg-[var(--noc-card)] rounded-2xl border border-[var(--noc-hairline)] p-4 space-y-3">
                  <span className={labelCls}>Not quite right? Give a note</span>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_NOTES.map((q) => (
                      <button key={q} type="button" onClick={() => setNote(q)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          note === q ? 'border-[#d946a8] bg-[rgba(217,70,168,0.1)]' : 'border-[var(--noc-hairline)] hover:border-[rgba(233,233,237,0.2)]'
                        }`}>{q}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input aria-label="Your note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                      placeholder="Or say it your way" className={`${inputCls} flex-1`} />
                    <button type="button" disabled={!note.trim() || compose.isPending || scene.trim().length < 10}
                      onClick={() => compose.mutate(payload(note.trim()))}
                      className="px-4 rounded-xl bg-[var(--noc-magenta)] text-white text-sm font-semibold disabled:opacity-40">
                      Redo
                    </button>
                  </div>
                  {result.creditsUsed > 0 && <p className="text-[var(--noc-t6)] text-xs">Last run used {result.creditsUsed} credits.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
