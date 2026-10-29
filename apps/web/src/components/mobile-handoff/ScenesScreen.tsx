'use client';

import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { EnableCinematicButton } from '@/components/story/EnableCinematicButton';
import { MultiShotControls } from '@/components/story/MultiShotControls';
import { Pill, Skeleton, EmptyState } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';
import { useTrackTab } from './useTrackTab';
import { useState } from 'react';
import { canStartBatch, defaultResumeCap, summarizeBatch, describeBatchPanel } from '@/lib/batchGenerationUi';
import { resolveNarrationPath } from '@/lib/narrationPath';

/**
 * Scenes list — design_handoff_raivstream_mobile, screen 6 of 8.
 * Canonical: /story-playground/[projectId]/scenes.
 *
 * Responsive desktop reconciliation (Section 9): mobile keeps the exact
 * original single-column card stack. At `lg:` and up the same cards
 * arrange into a responsive grid (2 cols at 1024, 3 at wide) instead of
 * a single 440px-wide column stretched down a tall desktop viewport.
 */

function sceneStatus(scene: any): { label: string; tone: 'ready' | 'generating' | 'draft' | 'failed'; cta: string } {
  switch (scene.imageStatus) {
    case 'READY':
      return { label: 'Ready', tone: 'ready', cta: 'Regenerate →' };
    case 'GENERATING':
      return { label: 'Generating', tone: 'generating', cta: 'View →' };
    case 'FAILED':
      return { label: 'Failed', tone: 'failed', cta: 'Retry →' };
    default:
      return { label: 'Draft', tone: 'draft', cta: 'Direct →' };
  }
}

function castNames(scene: any): string[] {
  if (!Array.isArray(scene.characters)) return [];
  return scene.characters
    .map((c: any) => (typeof c === 'string' ? c : c?.name))
    .filter(Boolean)
    // The scene's `characters` JSON sometimes stores a full description in
    // the `name` field rather than a short display name — truncate so the
    // chip stays a chip instead of wrapping across several lines.
    .map((name: string) => (name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name))
    .slice(0, 3);
}

export function ScenesScreen({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();
  useTrackTab(projectId, 'scenes');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  const scenes: any[] = (workspaceQuery.data as any)?.project?.sceneSeeds ?? [];
  const contentType: string | null = (workspaceQuery.data as any)?.project?.contentType ?? null;
  const utils = trpc.useUtils();
  const addScene = trpc.story.addScene.useMutation({ onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }) });
  // D-012 — content type decides which narration procedure runs; `isR16` alone is
  // not enough (it sent R16 story projects to the educational procedure, which the
  // server rejects). See lib/narrationPath.ts for the three-way rule.
  const generateSceneNarration = trpc.story.generateSceneNarration.useMutation();
  const generateEducationalNarration = trpc.story.generateEducationalNarration.useMutation();
  const generateStoryNarration = trpc.story.generateStoryNarration.useMutation();
  const [narrationBusy, setNarrationBusy] = useState(false);

  // R16-04 — batch generation ("make all pictures").
  const sceneIds = scenes.map((s: any) => s.id);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchCap, setBatchCap] = useState('10000');
  const [batchRunId, setBatchRunId] = useState<string | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeCap, setResumeCap] = useState('');
  const batchEstimate = trpc.story.batchEstimate.useQuery({ projectId, sceneIds }, { enabled: showBatchDialog && sceneIds.length > 0 });
  const batchRun = trpc.story.getBatchRun.useQuery({ runId: batchRunId ?? '' }, { enabled: Boolean(batchRunId), refetchInterval: 3000 });
  const startBatch = trpc.story.startBatchGeneration.useMutation();
  const cancelBatch = trpc.story.cancelBatchRun.useMutation({ onSuccess: () => utils.story.getBatchRun.invalidate() });
  const retryBatch = trpc.story.retryFailedItems.useMutation({ onSuccess: () => utils.story.getBatchRun.invalidate() });
  const resumeBatch = trpc.story.resumeBatchRun.useMutation({ onSuccess: () => { setResumeOpen(false); utils.story.getBatchRun.invalidate(); } });

  const batchData: any = batchRun.data;
  const estimated = batchEstimate.data?.estimated ?? 0;
  const perItemCost = batchEstimate.data?.perItemCost ?? 0;
  const startOk = canStartBatch(estimated, Number(batchCap) || 0);
  const summary = summarizeBatch((batchData?.items ?? []) as any);
  const panel = batchData ? describeBatchPanel(batchData.run.status, summary) : null;

  async function doStartBatch() {
    const run: any = await startBatch.mutateAsync({ projectId, sceneIds, costCapCredits: Number(batchCap) || undefined });
    setBatchRunId(run?.id ?? null);
    setShowBatchDialog(false);
  }

  const runNarration = async () => {
    setNarrationBusy(true);
    try {
      const path = resolveNarrationPath({ isR16, contentType });
      for (const scene of scenes) {
        if (path === 'educational') {
          await generateEducationalNarration.mutateAsync({ projectId, sceneId: scene.id });
        } else if (path === 'story') {
          await generateStoryNarration.mutateAsync({ projectId, sceneId: scene.id });
        } else {
          await generateSceneNarration.mutateAsync({ projectId, sceneId: scene.id });
        }
      }
      utils.story.getWorkspace.invalidate({ projectId });
    } finally {
      setNarrationBusy(false);
    }
  };

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Scenes" activeTab="scenes" projectId={projectId}>
      <div className="flex flex-col gap-3 px-[18px] pt-3.5 pb-8 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-5 lg:px-10 lg:py-10 lg:max-w-[1280px] lg:mx-auto">
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <span className="noc-label">Scenes</span>
            <h1 style={{ fontSize: 21, fontWeight: 500, textTransform: 'uppercase', color: 'var(--noc-t1)', margin: 0 }}>
              {scenes.length} scene{scenes.length === 1 ? '' : 's'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={runNarration} disabled={narrationBusy || scenes.length === 0} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '10px 14px' }}>
              {narrationBusy ? 'Generating narration…' : 'Generate narration'}
            </button>
            <button type="button" onClick={() => setShowBatchDialog(true)} disabled={scenes.length === 0} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '10px 14px' }}>
              Make all pictures
            </button>
            <button type="button" onClick={() => addScene.mutate({ projectId })} disabled={addScene.isPending} className="noc-btn-primary" style={{ fontSize: 12.5, padding: '10px 14px' }}>
              {addScene.isPending ? 'Adding…' : '+ Add Scene'}
            </button>
          </div>
        </div>
        {/* Manifest entry point: without this the scene cards have no shot grid,
            so "Generate shots" never appears. Hidden once a manifest exists. */}
        <div style={{ gridColumn: '1 / -1' }}>
          <EnableCinematicButton projectId={projectId} />
        </div>
        {workspaceQuery.isLoading ? (
          <>
            <Skeleton height={200} radius={18} />
            <Skeleton height={200} radius={18} />
          </>
        ) : scenes.length === 0 ? (
          <EmptyState title="No scenes yet" hint="Generate a story to seed your first scenes." />
        ) : (
          scenes.map((scene) => {
            const status = sceneStatus(scene);
            const cast = castNames(scene);
            const cover = scene.imageUrl ?? scene.assets?.find((a: any) => a.status === 'READY')?.thumbnailUrl ?? null;
            const narrationAudio: string | null = scene.narrationAudioUrl ?? null;
            return (
              <div key={scene.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link
                href={`/story-playground/${projectId}/scenes/${scene.id}`}
                className="noc-pressable"
                style={{
                  display: 'block',
                  borderRadius: 18,
                  overflow: 'hidden',
                  border: '1px solid rgba(233,233,237,0.08)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ aspectRatio: '16 / 9', background: cover ? `url(${cover}) center/cover` : gradientPlaceholder(scene.id) }} />
                {narrationAudio && (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                  <div onClick={(e) => e.preventDefault()} style={{ padding: '6px 14px 0' }}>
                    {/* Phase C: educational narration audio player (R16-safe, no Film-tab required) */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={narrationAudio} style={{ width: '100%', height: 32 }} />
                  </div>
                )}
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--noc-t6)' }}>
                      {String(scene.orderIndex + 1).padStart(2, '0')}
                    </span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                  <span style={{ fontSize: 14.5, fontWeight: 500, textTransform: 'uppercase', color: 'var(--noc-t1)' }}>{scene.title}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--noc-t5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {scene.description}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {cast.map((name) => (
                        <span key={name} style={{ fontSize: 11, borderRadius: 999, padding: '3px 8px', background: 'rgba(233,233,237,0.06)', color: 'var(--noc-t5)' }}>
                          {name}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--noc-lavender-tint)', flexShrink: 0 }}>{status.cta}</span>
                  </div>
                </div>
              </Link>
              {/* Shot controls live beside the card, not inside the Link: this is
                  the only place in the workspace that can render them, and the
                  per-scene detail route does not exist yet. */}
              <MultiShotControls projectId={projectId} sceneId={scene.id} />
              </div>
            );
          })
        )}
        {showBatchDialog && (
          <div style={{ gridColumn: '1 / -1', borderRadius: 16, border: '1px solid rgba(233,233,237,0.14)', background: 'rgba(233,233,237,0.04)', padding: 14 }}>
            <span className="noc-label">Make all pictures</span>
            <p style={{ fontSize: 13.5, color: 'var(--noc-t2)', marginTop: 8 }}>
              {batchEstimate.isLoading ? 'Working out the cost…' : `${sceneIds.length} picture${sceneIds.length === 1 ? '' : 's'} · about ${estimated} credits.`}
            </p>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--noc-t5)', marginTop: 8 }}>
              Credit limit
              <input value={batchCap} onChange={(e) => setBatchCap(e.target.value)} inputMode="numeric" style={{ marginLeft: 8, width: 110, borderRadius: 8, border: '1px solid rgba(233,233,237,0.16)', background: 'rgba(0,0,0,0.2)', color: 'var(--noc-t1)', padding: '6px 8px', fontSize: 13 }} />
            </label>
            {!startOk && <p style={{ fontSize: 12.5, color: '#e35d5d', marginTop: 6 }}>That is more than the limit — raise it to continue.</p>}
            {startBatch.error && <p style={{ fontSize: 12.5, color: '#e35d5d', marginTop: 6 }}>{startBatch.error.message}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" disabled={!startOk || startBatch.isPending} onClick={doStartBatch} className="noc-btn-primary" style={{ fontSize: 12.5, padding: '10px 14px' }}>
                {startBatch.isPending ? 'Starting…' : 'Start'}
              </button>
              <button type="button" onClick={() => setShowBatchDialog(false)} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '10px 14px' }}>Not now</button>
            </div>
          </div>
        )}

        {batchRunId && panel?.show && (
          <div style={{ gridColumn: '1 / -1', borderRadius: 16, border: '1px solid rgba(79,139,214,0.3)', background: 'rgba(79,139,214,0.08)', padding: 14 }}>
            <span className="noc-label">{panel.headline}</span>
            <p style={{ fontSize: 12.5, color: 'var(--noc-t5)', marginTop: 8 }}>{batchData.run.costUsedCredits} of {batchData.run.costCapCredits} credits used.</p>
            {batchData.run.status === 'PAUSED' && (
              <p style={{ fontSize: 12.5, color: '#e3b25d' }}>We reached the credit limit for this run.</p>
            )}
            {panel.showItems && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {(batchData.items ?? []).map((it: any, idx: number) => (
                  <span key={it.id} style={{ fontSize: 12, color: 'var(--noc-t5)' }}>
                    Picture {idx + 1}: {it.status === 'READY' ? 'done' : it.status === 'FAILED' ? 'did not work' : it.status === 'RUNNING' ? 'working…' : 'waiting'}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {panel.showRetry && (
                <button type="button" onClick={() => retryBatch.mutate({ runId: batchRunId })} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '9px 13px' }}>Try the failed ones again</button>
              )}
              {panel.showCancel && (
                <button type="button" onClick={() => cancelBatch.mutate({ runId: batchRunId })} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '9px 13px' }}>Stop</button>
              )}
              {panel.showStartAnother && (
                <button type="button" onClick={() => { setBatchRunId(null); setShowBatchDialog(true); }} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '9px 13px' }}>Start another batch</button>
              )}
              {panel.showResume && !resumeOpen && (
                <button type="button" onClick={() => { setResumeCap(String(defaultResumeCap(batchData.run.costUsedCredits, perItemCost || 80))); setResumeOpen(true); }} className="noc-btn-primary" style={{ fontSize: 12.5, padding: '9px 13px' }}>Keep going</button>
              )}
            </div>
            {resumeOpen && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12.5, color: 'var(--noc-t5)' }}>
                  New credit limit
                  <input value={resumeCap} onChange={(e) => setResumeCap(e.target.value)} inputMode="numeric" style={{ marginLeft: 8, width: 110, borderRadius: 8, border: '1px solid rgba(233,233,237,0.16)', background: 'rgba(0,0,0,0.2)', color: 'var(--noc-t1)', padding: '6px 8px', fontSize: 13 }} />
                </label>
                {resumeBatch.error && <p style={{ fontSize: 12.5, color: '#e35d5d', marginTop: 6 }}>{resumeBatch.error.message}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" disabled={resumeBatch.isPending} onClick={() => resumeBatch.mutate({ runId: batchRunId, costCapCredits: Number(resumeCap) || undefined })} className="noc-btn-primary" style={{ fontSize: 12.5, padding: '9px 13px' }}>
                    {resumeBatch.isPending ? 'Starting…' : 'Keep going'}
                  </button>
                  <button type="button" onClick={() => setResumeOpen(false)} className="noc-btn-outline" style={{ fontSize: 12.5, padding: '9px 13px' }}>Not now</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
