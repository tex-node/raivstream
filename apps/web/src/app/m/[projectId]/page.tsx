'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, SectionLabel } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

/**
 * /m/[projectId] — Project Overview. design_handoff_raivstream_mobile, screen 2 of 8.
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

export default function MobileProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.projectId);
  const { isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  if (workspaceQuery.isLoading) {
    return (
      <Shell backHref="/m" title="Loading…" activeTab="home" projectId={projectId}>
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
      <Shell backHref="/m" title="Project" activeTab="home" projectId={projectId}>
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

  return (
    <Shell backHref="/m" title={project.title} activeTab="home" projectId={projectId}>
      <div
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

      <div style={{ padding: '16px 18px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {nextScene ? (
          <button
            type="button"
            onClick={() => router.push(`/m/${projectId}/scenes/${nextScene.id}`)}
            className="noc-btn-primary"
          >
            Continue Scene {String(nextScene.orderIndex + 1).padStart(2, '0')}
          </button>
        ) : (
          <button type="button" onClick={() => router.push(`/m/${projectId}/story`)} className="noc-btn-primary">
            Continue the story
          </button>
        )}

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={() => router.push(`/m/${projectId}/story`)} className="noc-btn-outline">
            Story
          </button>
          <button type="button" onClick={() => router.push(`/m/${projectId}/cast`)} className="noc-btn-outline">
            Characters
          </button>
        </div>

        {/* The design handoff's 8 mobile screens don't cover Audio, Film, or
            Storybook — no mobile design was supplied for them. Rather than
            silently dropping access to already-qualified production
            capability, these link straight into the existing, unmodified
            desktop-styled implementation. Hidden for R16, matching the
            desktop workspace's own tab visibility rule. */}
        {!isR16 && (
          <div>
            <SectionLabel>More</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {[
                { label: 'Audio', tab: 'audio' },
                { label: 'Sequence', tab: 'sequence' },
                { label: 'Film', tab: 'film' },
                { label: 'Storybook', tab: 'storybook' },
              ].map((item) => (
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
    </Shell>
  );
}
