'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, SectionLabel } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/**
 * Project Overview — design_handoff_raivstream_mobile, screen 2 of 8.
 * Canonical: /story-playground/[projectId].
 *
 * Responsive desktop reconciliation: mobile keeps the exact original
 * single-column stack (hero → CTA → stats → Story/Characters → More).
 * At `lg:` and up this becomes a workspace dashboard split (Section 6):
 * a left/main column (hero, primary action, Story/Characters) and a
 * right column (stats + More tools), laid out via CSS grid so nothing
 * needs to be duplicated in the markup.
 */

function StatRow({ label, value, note, noteColor }: { label: string; value: string; note?: string; noteColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--noc-rule)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--noc-t4)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--noc-t1)' }}>{value}</span>
        {note && <span style={{ fontSize: 11.5, color: noteColor ?? 'var(--noc-t5)' }}>{note}</span>}
      </div>
    </div>
  );
}

export function ProjectOverviewScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();
  useTrackTab(projectId, 'overview');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  if (workspaceQuery.isLoading) {
    return (
      <Shell backHref="/story-playground" title="Loading…" activeTab="home" projectId={projectId}>
        <div style={{ padding: 18 }}>
          <Skeleton height={186} radius={0} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
          </div>
        </div>
      </Shell>
    );
  }

  if (workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <Shell backHref="/story-playground" title="Project" activeTab="home" projectId={projectId}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--noc-t4)' }}>This project couldn&apos;t be loaded.</p>
        </div>
      </Shell>
    );
  }

  const { project, summary } = workspaceQuery.data as any;
  const scenes: any[] = project.sceneSeeds ?? [];
  const pct = scenes.length > 0 ? Math.round((summary.readyImageCount / scenes.length) * 100) : 0;
  const nextScene = scenes.find((s) => s.imageStatus !== 'READY') ?? scenes[0] ?? null;
  const heroImage = summary.coverThumbnail ?? null;

  const moreItems = [
    { label: 'Audio', tab: 'audio' },
    { label: 'Sequence', tab: 'sequence' },
    { label: 'Film', tab: 'film' },
    { label: 'Storybook', tab: 'storybook' },
  ];

  return (
    <Shell backHref="/story-playground" title={project.title} activeTab="home" projectId={projectId}>
      <div className="lg:max-w-[1280px] lg:mx-auto lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:px-10 lg:py-10 lg:items-start">
        {/* Left/main column — hero, primary action, Story/Characters. */}
        <div>
          <div
            className="lg:rounded-2xl lg:overflow-hidden"
            style={{
              height: 186,
              position: 'relative',
              background: heroImage ? `url(${heroImage}) center/cover` : gradientPlaceholder(projectId),
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, transparent, rgba(7,8,16,0.88))',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '0 18px 16px',
              }}
            >
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--noc-pink-tint)', fontWeight: 600 }}>
                {project.visualStyle ?? 'Story'} · {pct}% done
              </span>
              <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--noc-t1)', margin: '2px 0 0', textWrap: 'balance' as any }}>{project.title}</h1>
            </div>
          </div>

          <div className="lg:mt-6 lg:!px-0" style={{ padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {nextScene ? (
              <button
                type="button"
                onClick={() => router.push(`/story-playground/${projectId}/scenes/${nextScene.id}`)}
                className="noc-btn-primary lg:!w-auto lg:!px-8"
              >
                Continue Scene {String(nextScene.orderIndex + 1).padStart(2, '0')}
              </button>
            ) : (
              <button type="button" onClick={() => router.push(`/story-playground/${projectId}/story`)} className="noc-btn-primary lg:!w-auto lg:!px-8">
                Continue the story
              </button>
            )}

            <div className="lg:max-w-[420px]" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button type="button" onClick={() => router.push(`/story-playground/${projectId}/story`)} className="noc-btn-outline">
                Story
              </button>
              <button type="button" onClick={() => router.push(`/story-playground/${projectId}/characters`)} className="noc-btn-outline">
                Characters
              </button>
            </div>
          </div>
        </div>

        {/* Right column — metadata stats + More tools. Mobile: same content,
            just falls below the left column in source order (no lg: grid). */}
        <div className="lg:mt-0 lg:!pt-0" style={{ padding: '16px 18px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <StatRow label="Story" value={`${summary.chapterCount} chapter${summary.chapterCount === 1 ? '' : 's'}`} />
            <StatRow label="Characters" value={String(summary.characterCount)} note={summary.characterCount === 0 ? 'add your cast' : undefined} noteColor="var(--noc-pink-tint)" />
            <StatRow label="Scenes" value={String(summary.sceneCount)} />
            <StatRow
              label="Assets"
              value={`${summary.readyImageCount} ready`}
              note={summary.readyImageCount < summary.sceneCount ? `${summary.sceneCount - summary.readyImageCount} pending` : 'all set'}
              noteColor={summary.readyImageCount < summary.sceneCount ? 'var(--noc-pink-tint)' : 'var(--noc-cyan-tint)'}
            />
            {!isR16 && (
              <StatRow
                label="Storybook"
                value={summary.storybookReady ? 'Ready' : 'Not ready'}
                noteColor={summary.storybookReady ? 'var(--noc-cyan-tint)' : 'var(--noc-t5)'}
              />
            )}
          </div>

          {/* The design handoff's 8 mobile screens don't cover Audio, Film, or
              Storybook — no mobile design was supplied for them. Rather than
              silently dropping access to already-qualified production
              capability, these link straight into the existing, unmodified
              legacy tab presentation (?tab=X on this same route — see the
              branch in [projectId]/page.tsx). Hidden for R16, matching the
              legacy workspace's own tab visibility rule. */}
          {!isR16 && (
            <div>
              <SectionLabel>More</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {moreItems.map((item) => (
                  <Link
                    key={item.tab}
                    href={`/story-playground/${projectId}?tab=${item.tab}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 0',
                      borderBottom: '1px solid var(--noc-rule)',
                      textDecoration: 'none',
                      color: 'var(--noc-t2)',
                      fontSize: 13.5,
                    }}
                  >
                    {item.label}
                    <span style={{ color: 'var(--noc-t6)', fontSize: 12 }}>Open →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
