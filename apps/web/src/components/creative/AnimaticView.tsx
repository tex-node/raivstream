'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── Local types (mirror API animaticTypes without cross-package import) ───────

export type AnimaticFrameStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

export interface AnimaticFrameUI {
  id: string;
  sceneIndex: number;
  sceneId: string;
  sceneLabel: string;
  visualPrompt: string;
  status: AnimaticFrameStatus;
  imageUrl?: string;
  directorNote?: string;
}

export interface AnimaticSceneUI {
  id: string;
  ordinal: number;
  label: string;
  description: string;
  emotionalDirection: string;
  structuralPosition: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusPip({ status }: { status: AnimaticFrameStatus }) {
  switch (status) {
    case 'READY':      return <span className="inline-block h-2 w-2 rounded-full bg-[#4ade80]" aria-label="Ready" />;
    case 'GENERATING': return <span className="inline-block h-2 w-2 rounded-full bg-[var(--noc-blue)] animate-pulse" aria-label="Generating" />;
    case 'FAILED':     return <span className="inline-block h-2 w-2 rounded-full bg-[#e35d5d]" aria-label="Failed" />;
    default:           return <span className="inline-block h-2 w-2 rounded-full bg-[rgba(233,233,237,0.2)]" aria-label="Pending" />;
  }
}

function FrameCard({
  frame,
  scene,
  onDirectScene,
}: {
  frame: AnimaticFrameUI;
  scene?: AnimaticSceneUI;
  onDirectScene: (sceneId: string, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState(frame.directorNote ?? '');

  const handleSaveNote = useCallback(() => {
    onDirectScene(frame.sceneId, noteText.trim());
    setEditing(false);
  }, [frame.sceneId, noteText, onDirectScene]);

  return (
    <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] overflow-hidden">
      {/* Frame image / placeholder */}
      <div className="relative aspect-video bg-[rgba(0,0,0,0.3)] flex items-center justify-center">
        {frame.status === 'READY' && frame.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame.imageUrl}
            alt={`Scene ${frame.sceneIndex + 1}: ${frame.sceneLabel}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <StatusPip status={frame.status} />
            <span className="text-xs text-[var(--noc-t5)]">
              {frame.status === 'GENERATING' ? 'Generating…' :
               frame.status === 'FAILED' ? 'Generation failed' :
               'Awaiting generation'}
            </span>
          </div>
        )}
        {/* Scene number badge */}
        <span className="absolute top-2 left-2 rounded-md bg-[rgba(0,0,0,0.5)] px-2 py-0.5 text-xs font-bold text-white">
          {frame.sceneIndex + 1}
        </span>
      </div>

      {/* Scene info */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--noc-t1)]">{frame.sceneLabel}</h3>
          <StatusPip status={frame.status} />
        </div>
        {scene && (
          <p className="text-xs text-[var(--noc-t5)] leading-relaxed line-clamp-2">
            {scene.description}
          </p>
        )}
        {scene && (
          <p className="text-xs text-[var(--noc-t6)] italic">{scene.emotionalDirection}</p>
        )}

        {/* Director note */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoFocus
              rows={3}
              maxLength={500}
              placeholder="Describe what you'd like to change about this scene's visual…"
              className="w-full resize-none rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-xs text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)] placeholder:text-[var(--noc-t6)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveNote}
                className="rounded-lg bg-[var(--noc-purple)] px-3 py-1.5 text-xs font-bold text-white"
              >
                Save note
              </button>
              <button
                type="button"
                onClick={() => { setNoteText(frame.directorNote ?? ''); setEditing(false); }}
                className="rounded-lg border border-[rgba(233,233,237,0.15)] px-3 py-1.5 text-xs text-[var(--noc-t4)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {frame.directorNote && (
              <p className="mb-1 rounded-lg bg-[rgba(178,90,217,0.1)] px-3 py-2 text-xs text-[var(--noc-t3)] italic">
                &ldquo;{frame.directorNote}&rdquo;
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-[var(--noc-purple)] hover:underline"
            >
              {frame.directorNote ? 'Edit direction' : 'Direct this scene'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main AnimaticView ─────────────────────────────────────────────────────────

export function AnimaticView({
  animaticId,
  scenes,
  frames,
  overallStatus,
  generationEnabled,
  starting,
  startError,
  onDirectScene,
  onApprove,
  onBack,
}: {
  animaticId: string;
  scenes: AnimaticSceneUI[];
  frames: AnimaticFrameUI[];
  overallStatus: AnimaticFrameStatus;
  generationEnabled: boolean;
  starting?: boolean;
  startError?: string;
  onDirectScene: (sceneId: string, note: string) => void;
  onApprove: () => void;
  onBack: () => void;
}) {
  const [approveEnabled, setApproveEnabled] = useState(false);

  // Enable approval once generation is done (or if generation is disabled — §30)
  useEffect(() => {
    if (overallStatus === 'READY' || !generationEnabled) {
      setApproveEnabled(true);
    } else if (overallStatus === 'FAILED') {
      // Failed frames still allow approval — user can proceed
      setApproveEnabled(true);
    }
  }, [overallStatus, generationEnabled]);

  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[var(--noc-purple)]"
        >
          ← Back
        </button>
      </div>

      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
        <h2 className="text-xl font-black tracking-tight text-[var(--noc-t1)]">
          Your First-Frame Animatic
        </h2>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          {generationEnabled
            ? 'Homer has visualised the opening frame for each scene. Review and direct before building your project.'
            : 'Scene plan is ready. Add any director notes before building your project.'}
        </p>

        {/* Generation status banner */}
        {generationEnabled && overallStatus === 'GENERATING' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--noc-t5)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--noc-blue)] animate-pulse" />
            Generating frames…
          </div>
        )}
        {generationEnabled && overallStatus === 'READY' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#4ade80]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
            All frames ready
          </div>
        )}
        {!generationEnabled && (
          <div className="mt-3 rounded-lg bg-[rgba(233,233,237,0.05)] border border-[rgba(233,233,237,0.1)] px-3 py-2 text-xs text-[var(--noc-t5)]">
            Live image generation requires authorized media credits.
          </div>
        )}
      </div>

      {/* Frame grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {frames.map((frame) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            scene={sceneMap.get(frame.sceneId)}
            onDirectScene={onDirectScene}
          />
        ))}
      </div>

      {/* Approve */}
      {startError && (
        <p className="text-sm text-[#e35d5d]">{startError}</p>
      )}
      <button
        type="button"
        disabled={!approveEnabled || starting}
        onClick={onApprove}
        className="w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-40"
      >
        {starting ? 'Building project…' : 'Build this project'}
      </button>

      {/* animaticId for acceptance tests */}
      <p className="hidden" data-animatic-id={animaticId} />
    </div>
  );
}
