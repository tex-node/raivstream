'use client';

import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Pill, Skeleton, EmptyState } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/** Scenes list — design_handoff_raivstream_mobile, screen 6 of 8. Canonical: /story-playground/[projectId]/scenes. */

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
  useTrackTab(projectId, 'scenes');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  const scenes: any[] = (workspaceQuery.data as any)?.project?.sceneSeeds ?? [];

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Scenes" activeTab="scenes" projectId={projectId}>
      <div style={{ padding: '14px 18px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            return (
              <Link
                key={scene.id}
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
            );
          })
        )}
      </div>
    </Shell>
  );
}
