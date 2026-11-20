'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { trpc } from '@/lib/trpc';

/**
 * The project index (2026-11-20).
 *
 * There was no such page. `/projects/[projectId]` existed but nothing listed projects, so the Creative 5.0 workspaces —
 * the most built-out part of the product — were reachable only through `/create`'s resume-draft path or a direct link.
 * And the story projects had their own separate list inside `/story-playground`, so "what am I working on" had two
 * answers on two pages.
 *
 * This is one answer: every project of either kind, newest first, each card carrying the one thing the backend already
 * knows — what the next step is — so the list is a place to continue work rather than a gallery.
 */

const STATUS_LABEL: Record<string, string> = {
  // Creative 5.0
  IDEA: 'Idea',
  INTERPRETING: 'Understanding',
  PLANNING: 'Planning',
  PREVIEW: 'Preview',
  DIRECTING: 'Directing',
  GENERATING: 'Producing',
  REVIEW: 'Review',
  REFINING: 'Refining',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
  // Story Playground
  DRAFT: 'Draft',
  GENERATED: 'Story written',
  EXTENDED: 'Story extended',
  STORYBOARDED: 'Storyboarded',
  IN_PRODUCTION: 'In production',
};

const NEXT_STEP_LABEL: Record<string, string> = {
  UNDERSTAND_INTENT: 'Describe what you want',
  BUILD_BIBLE: 'Build the story bible',
  REVIEW_PLAN: 'Review the plan',
  APPROVE_PREVIEW: 'Approve the preview',
  PRODUCE: 'Produce the film',
  REVIEW_OUTPUT: 'Review the film',
  DIRECT: 'Direct the next scene',
  APPROVE_OUTPUT: 'Approve the output',
  EXPORT: 'Export',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'films', label: 'Films' },
  { value: 'stories', label: 'Stories' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

/**
 * `story.listMyProjects` returns `any` (its router casts `ctx.prisma`), so the shape this page relies on is declared here
 * rather than left implicit — it is the contract the card below depends on, and a field rename should fail this file.
 */
interface StoryProjectCard {
  id: string;
  title: string;
  status: string;
  updatedAt: string | Date;
  _count?: { chapters?: number; sceneSeeds?: number } | null;
  sceneSeeds?: Array<{ imageUrl?: string | null }> | null;
}

function relativeWhen(value: string | Date): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const ms = Date.now() - then.getTime();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return then.toLocaleDateString();
}

export default function ProjectsPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const creative = trpc.creative.project.list.useQuery(undefined);
  const stories = trpc.story.listMyProjects.useQuery({ limit: 30 });

  const films = creative.data ?? [];
  const storyProjects = (stories.data ?? []) as StoryProjectCard[];

  const counts = useMemo(
    () => ({ films: films.length, stories: storyProjects.length }),
    [films.length, storyProjects.length],
  );

  const showFilms = filter === 'all' || filter === 'films';
  const showStories = filter === 'all' || filter === 'stories';
  const loading = creative.isLoading || stories.isLoading;
  const error = creative.error ?? stories.error;
  const nothingYet = !loading && !error && counts.films === 0 && counts.stories === 0;

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[var(--noc-t1)]">Projects</h1>
            <p className="mt-1 text-sm text-[var(--noc-t4)]">
              Everything you are working on — films in the 5.0 pipeline and Story Playground stories — in one list.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/create"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
            >
              New film
            </Link>
            <Link
              href="/story-playground/new?type=story"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--noc-card)', color: 'var(--noc-t2)', border: '1px solid var(--noc-hairline)' }}
            >
              Start a story
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {FILTERS.map((option) => {
            const count = option.value === 'films' ? counts.films : option.value === 'stories' ? counts.stories : counts.films + counts.stories;
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                  active
                    ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
                    : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
                }`}
              >
                {option.label}
                <span className="ml-1.5 text-[var(--noc-t6)]">{count}</span>
              </button>
            );
          })}
        </div>

        {loading && <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading your projects…</p>}

        {error && <p className="mt-8 text-sm text-[var(--noc-magenta)]">{error.message}</p>}

        {nothingYet && (
          <div className="mt-10 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
            <p className="text-sm font-semibold text-[var(--noc-t3)]">Nothing here yet.</p>
            <p className="mt-1 text-xs text-[var(--noc-t5)]">
              A film starts with one sentence about what you want to see. A story starts with an idea.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link
                href="/create"
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
              >
                Start a film
              </Link>
              <Link
                href="/story-playground/new?type=story"
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: 'var(--noc-bar)', color: 'var(--noc-t2)', border: '1px solid var(--noc-hairline)' }}
              >
                Start a story
              </Link>
            </div>
          </div>
        )}

        {showFilms && !loading && !error && counts.films > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--noc-t6)]">Films</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {films.map((project) => {
                const status = STATUS_LABEL[project.status] ?? project.status;
                const next = NEXT_STEP_LABEL[project.nextAction];
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4 transition-colors hover:border-[rgba(178,90,217,0.45)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-[rgba(178,90,217,0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--noc-t2)]">
                        {project.projectType}
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--noc-t6)]">{status}</span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--noc-t1)]">{project.title}</h3>
                    {project.brief?.originalIntent && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--noc-t5)]">{project.brief.originalIntent}</p>
                    )}
                    <p className="mt-3 text-[11px] text-[var(--noc-t4)]">
                      {next ? `Next: ${next}` : project.hasPlan ? 'Plan ready' : 'No plan yet'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--noc-t6)]">{relativeWhen(project.updatedAt)}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {showStories && !loading && !error && counts.stories > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--noc-t6)]">Stories</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {storyProjects.map((project) => {
                const scenes = project._count?.sceneSeeds ?? 0;
                const chapters = project._count?.chapters ?? 0;
                const cover = project.sceneSeeds?.find((scene) => scene.imageUrl)?.imageUrl ?? null;
                const status = STATUS_LABEL[project.status] ?? project.status;
                return (
                  <Link
                    key={project.id}
                    href={`/story-playground/${project.id}`}
                    className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] transition-colors hover:border-[rgba(178,90,217,0.45)]"
                  >
                    <div className="flex gap-3 p-3">
                      <div
                        className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl"
                        style={{ background: 'var(--noc-bar)' }}
                      >
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg text-[var(--noc-t6)]">✦</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-sm font-semibold text-[var(--noc-t1)]">{project.title}</h3>
                        <p className="mt-1 text-[11px] text-[var(--noc-t5)]">
                          {chapters} {chapters === 1 ? 'chapter' : 'chapters'} · {scenes} {scenes === 1 ? 'scene' : 'scenes'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--noc-t6)]">
                          {status} · {relativeWhen(project.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
