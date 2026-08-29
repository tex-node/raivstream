'use client';

import Link from 'next/link';
import { Sparkles, Megaphone, Clapperboard, Lightbulb } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState, SectionLabel } from '@/components/mobile/primitives';
import { gradientPlaceholder, timeAgo } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

/**
 * /m — Home. design_handoff_raivstream_mobile, screen 1 of 8 ("m: 'home'").
 * Real data via story.listMyProjects — no mock projects in production.
 */

const STARTERS = [
  { label: 'Create a Story', icon: Sparkles, type: 'story' },
  { label: 'Create an Advert', icon: Megaphone, type: 'advert' },
  { label: 'Create a Short Film', icon: Clapperboard, type: 'film' },
  { label: 'Start from an Idea', icon: Lightbulb, type: 'idea' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function projectProgressPct(project: any): number {
  const scenes: any[] = project.sceneSeeds ?? [];
  if (scenes.length === 0) return 0;
  const ready = scenes.filter((s) => (s.assets ?? []).length > 0).length;
  return Math.round((ready / scenes.length) * 100);
}

function projectStage(project: any, pct: number): string {
  if ((project.sceneSeeds ?? []).length === 0) return 'Just started';
  if (pct >= 100) return 'Ready to preview';
  return 'In progress';
}

export default function MobileHomePage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();
  const projectsQuery = trpc.story.listMyProjects.useQuery(
    { limit: 12 },
    { enabled: Boolean(isLoaded && isSignedIn) },
  );

  const projects = (projectsQuery.data as any[]) ?? [];
  const continueProjects = projects.slice(0, 2);
  const latest = projects.slice(0, 5);

  return (
    <Shell showSaved={false} activeTab="home">
      <div style={{ padding: '20px 18px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h1 className="noc-section-header">What are we making today?</h1>
          <p style={{ fontSize: 13.5, color: 'var(--noc-t6)', marginTop: 4 }}>
            {greeting()}{user?.displayName ? `, ${user.displayName}` : ''}.{' '}
            {isSignedIn
              ? projects.length > 0
                ? `${projects.length} project${projects.length === 1 ? '' : 's'} waiting.`
                : 'Ready to start your first project.'
              : 'Sign in to see your projects.'}
          </p>
        </div>

        {isSignedIn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projectsQuery.isLoading ? (
              <>
                <Skeleton height={88} radius={16} />
                <Skeleton height={88} radius={16} />
              </>
            ) : continueProjects.length === 0 ? (
              <EmptyState title="No projects yet" hint="Start with an idea below." />
            ) : (
              continueProjects.map((project) => {
                const pct = projectProgressPct(project);
                const thumb =
                  project.sceneSeeds?.flatMap((s: any) => s.assets ?? []).find((a: any) => a.thumbnailUrl || a.assetUrl)
                    ?.thumbnailUrl ??
                  project.sceneSeeds?.flatMap((s: any) => s.assets ?? []).find((a: any) => a.assetUrl)?.assetUrl ??
                  null;
                return (
                  <Link
                    key={project.id}
                    href={`/m/${project.id}`}
                    className="noc-pressable"
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      borderRadius: 16,
                      background: 'rgba(233,233,237,0.04)',
                      border: '1px solid rgba(233,233,237,0.08)',
                      textDecoration: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        flexShrink: 0,
                        background: thumb ? `url(${thumb}) center/cover` : gradientPlaceholder(project.id),
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--noc-t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {project.title}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--noc-t6)' }}>
                        {projectStage(project, pct)} · {timeAgo(project.updatedAt)}
                      </span>
                      <div style={{ height: 3, borderRadius: 999, background: 'rgba(233,233,237,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--noc-gradient)' }} />
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}

        <div>
          <SectionLabel>Start something</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 8 }}>
            {(isR16 ? STARTERS.filter((s) => s.type === 'story' || s.type === 'idea') : STARTERS).map(({ label, icon: Icon, type }) => (
              <Link
                key={type}
                href={`/story-playground?type=${type}`}
                className="noc-pressable"
                style={{
                  minHeight: 86,
                  borderRadius: 14,
                  border: '1px solid rgba(233,233,237,0.08)',
                  background: 'rgba(233,233,237,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 12,
                  textDecoration: 'none',
                }}
              >
                <Icon size={17} color="#b5abfc" strokeWidth={1.8} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--noc-t1)' }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>

        {isSignedIn && latest.length > 0 && (
          <div>
            <SectionLabel>Latest</SectionLabel>
            <div style={{ marginTop: 4 }}>
              {latest.map((project) => (
                <Link
                  key={project.id}
                  href={`/m/${project.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 0',
                    borderBottom: '1px solid var(--noc-rule)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--noc-cyan)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--noc-t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {project.title}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--noc-t6)', flexShrink: 0 }}>{timeAgo(project.updatedAt)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
