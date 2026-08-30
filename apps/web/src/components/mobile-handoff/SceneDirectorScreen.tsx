'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { SegRow, Skeleton, useGenerateProgress } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/**
 * Scene Director — design_handoff_raivstream_mobile, screen 7 of 8. Canonical:
 * /story-playground/[projectId]/scenes/[sceneId].
 *
 * The design mocks 11 pickable dimensions across 5 groups (Performance:
 * Emotion/Character behaviour/Energy; Camera: Shot size/Angle/Movement;
 * Environment: Time of day/Weather/Mood; Lighting: Light; Pace: Pace). The
 * real backend's directorSettingsSchema has exactly 7 fields (emotion,
 * cameraStyle, timeOfDay, weather, environmentMood, lighting, scenePace).
 * Rather than inventing 4 extra fields the backend can't persist, this
 * screen presents the real 7 fields in the design's 5-group layout:
 * Performance→Emotion, Camera→Camera style, Environment→Time of
 * day/Weather/Mood (a real 3-control group), Lighting→Light, Pace→Pace.
 */

// Responsive desktop reconciliation (Section 11): mobile keeps the exact
// original stack (preview, then title, then every control group beneath
// it, full width). At lg: and up this becomes a preview column (sticky,
// left) + a controls column (right) instead of controls stacked beneath
// a full-width preview -- all mutation/generation logic is unchanged.

const DIRECTOR_OPTIONS = {
  emotion: ['HAPPY', 'EXCITED', 'CURIOUS', 'BRAVE', 'CALM', 'SAD', 'SURPRISED'],
  cameraStyle: ['CLOSE_UP', 'MEDIUM_SHOT', 'WIDE_SHOT', 'OVER_THE_SHOULDER', 'BIRDS_EYE_VIEW', 'EYE_LEVEL'],
  timeOfDay: ['MORNING', 'AFTERNOON', 'SUNSET', 'NIGHT'],
  weather: ['SUNNY', 'RAINY', 'SNOWY', 'WINDY', 'FOGGY'],
  environmentMood: ['PEACEFUL', 'BUSY', 'MAGICAL', 'FUTURISTIC', 'COZY', 'ADVENTUROUS'],
  lighting: ['BRIGHT', 'WARM', 'SOFT', 'DRAMATIC', 'MOONLIGHT'],
  scenePace: ['CALM', 'NORMAL', 'ENERGETIC'],
} as const;

const DIRECTOR_GROUPS: Array<{ label: string; fields: Array<{ key: keyof typeof DIRECTOR_OPTIONS; fieldLabel: string }> }> = [
  { label: 'Performance', fields: [{ key: 'emotion', fieldLabel: 'Emotion' }] },
  { label: 'Camera', fields: [{ key: 'cameraStyle', fieldLabel: 'Shot style' }] },
  { label: 'Environment', fields: [
    { key: 'timeOfDay', fieldLabel: 'Time of day' },
    { key: 'weather', fieldLabel: 'Weather' },
    { key: 'environmentMood', fieldLabel: 'Mood' },
  ] },
  { label: 'Lighting', fields: [{ key: 'lighting', fieldLabel: 'Light' }] },
  { label: 'Pace', fields: [{ key: 'scenePace', fieldLabel: 'Pace' }] },
];

export function SceneDirectorScreen({ projectId, sceneId }: { projectId: string; sceneId: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();
  const utils = trpc.useUtils();
  const progress = useGenerateProgress();
  useTrackTab(projectId, 'scenes');
  const [reviewAssetUrl, setReviewAssetUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  const updateDirector = trpc.story.updateSceneDirector.useMutation({
    onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }),
  });
  const generateImage = trpc.story.generateSceneImage.useMutation();
  const regenerateImage = trpc.story.regenerateSceneImage.useMutation();

  const scene = ((workspaceQuery.data as any)?.project?.sceneSeeds ?? []).find((s: any) => s.id === sceneId);

  if (workspaceQuery.isLoading) {
    return (
      <Shell backHref={`/story-playground/${projectId}/scenes`} title="Scene Director" activeTab="scenes" projectId={projectId}>
        <div style={{ padding: 18 }}>
          <Skeleton height={220} radius={0} />
        </div>
      </Shell>
    );
  }

  if (!scene) {
    return (
      <Shell backHref={`/story-playground/${projectId}/scenes`} title="Scene Director" activeTab="scenes" projectId={projectId}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--noc-t4)' }}>Scene not found.</p>
        </div>
      </Shell>
    );
  }

  const hasReadyImage = scene.imageStatus === 'READY';
  const isReviewing = Boolean(reviewAssetUrl);
  const previewImage = reviewAssetUrl ?? scene.imageUrl ?? null;

  function pick(key: keyof typeof DIRECTOR_OPTIONS, value: string) {
    updateDirector.mutate({ projectId, sceneId, settings: { [key]: value } as any });
  }

  async function runGenerate() {
    setErrorMessage(null);
    setReviewAssetUrl(null);
    progress.start();
    try {
      const mutate = hasReadyImage ? regenerateImage.mutateAsync : generateImage.mutateAsync;
      const result: any = await mutate({ projectId, sceneId });
      progress.finish();
      setReviewAssetUrl(result?.assetUrl ?? result?.asset?.assetUrl ?? null);
    } catch (e: any) {
      progress.finish();
      setErrorMessage(e?.message ?? 'Generation failed. Try again.');
    }
  }

  function keepResult() {
    setReviewAssetUrl(null);
    utils.story.getWorkspace.invalidate({ projectId });
    router.push(`/story-playground/${projectId}/scenes`);
  }

  const generating = progress.running || generateImage.isPending || regenerateImage.isPending;
  const ctaLabel = generating ? 'Creating…' : isReviewing ? 'Try again' : hasReadyImage ? 'Regenerate picture' : 'Generate picture';

  return (
    <Shell
      backHref={`/story-playground/${projectId}/scenes`}
      title="Scene Director"
      activeTab="scenes"
      projectId={projectId}
      actionBar={
        isReviewing ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={keepResult} className="noc-btn-primary" style={{ flex: 1 }}>
              Keep
            </button>
            <button type="button" onClick={runGenerate} className="noc-btn-outline" style={{ flex: 1 }}>
              Improve
            </button>
          </div>
        ) : (
          <button type="button" onClick={runGenerate} disabled={generating} className="noc-btn-primary">
            {ctaLabel}
          </button>
        )
      }
    >
      <div className="lg:max-w-[1280px] lg:mx-auto lg:grid lg:grid-cols-[1fr_420px] lg:gap-8 lg:px-10 lg:py-10 lg:items-start">
        <div
          className="relative lg:rounded-2xl lg:overflow-hidden lg:sticky lg:top-24"
          style={{ aspectRatio: '16 / 10', background: previewImage ? `url(${previewImage}) center/cover` : gradientPlaceholder(sceneId) }}
        >
          {generating && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,13,20,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <span style={{ fontSize: 14, color: 'var(--noc-t2)' }}>{progress.label}</span>
              <div style={{ width: '62%', height: 4, borderRadius: 999, background: 'rgba(233,233,237,0.12)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress.pct}%`, background: 'var(--noc-gradient)', transition: 'width 400ms' }} />
              </div>
            </div>
          )}
          {isReviewing && !generating && (
            <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(217,70,168,0.9)', color: '#0B0D14', fontSize: 9.5, fontWeight: 600, borderRadius: 5, padding: '3px 7px' }}>
              New picture
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 px-[18px] pt-4 pb-6 lg:p-0">
          <div>
            <span className="noc-label">{String(scene.orderIndex + 1).padStart(2, '0')}</span>
            <h1 style={{ fontSize: 19, fontWeight: 500, textTransform: 'uppercase', color: 'var(--noc-t1)', margin: '2px 0 0' }}>{scene.title}</h1>
          </div>

          {errorMessage && (
            <div style={{ borderRadius: 12, padding: 10, background: 'rgba(227,93,93,0.12)', border: '1px solid rgba(227,93,93,0.3)' }}>
              <p style={{ fontSize: 13, color: '#e35d5d', margin: 0 }}>{errorMessage}</p>
            </div>
          )}

          {isReviewing && (
            <div style={{ borderRadius: 16, padding: 14, background: 'rgba(178,90,217,0.1)', border: '1px solid rgba(178,90,217,0.32)' }}>
              <p style={{ fontSize: 13.5, color: 'var(--noc-t2)', margin: 0 }}>New take ready. Keep this one, or try again?</p>
            </div>
          )}

          {!isR16 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {DIRECTOR_GROUPS.map((group) => (
                <div key={group.label}>
                  <span className="noc-label">{group.label}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                    {group.fields.map((field) => (
                      <div key={field.key}>
                        <p style={{ fontSize: 12.5, color: 'var(--noc-t4)', margin: '0 0 4px' }}>{field.fieldLabel}</p>
                        <SegRow
                          options={DIRECTOR_OPTIONS[field.key]}
                          value={scene[field.key] ?? undefined}
                          onChange={(value) => pick(field.key, value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--noc-t6)' }}>Advanced scene controls aren&apos;t shown here.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}
