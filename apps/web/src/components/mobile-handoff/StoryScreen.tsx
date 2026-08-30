'use client';

import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState } from '@/components/mobile/primitives';
import { splitParagraphs } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

/**
 * Story — design_handoff_raivstream_mobile, screen 3 of 8. Canonical:
 * /story-playground/[projectId]/story.
 *
 * Two known, documented deviations from the prototype (real-content reasons,
 * not fidelity shortcuts):
 * 1. The prototype hardcodes exactly two selectable mock paragraphs; here
 *    every real paragraph is selectable (single-select), since a real
 *    chapter's paragraph count is unbounded and the design's own
 *    interaction model generalizes cleanly (`sel` was already a single
 *    value, not per-item).
 * 2. The "Story health" card's four percentages (Premise/Character
 *    clarity/Conflict/Ending) are mock numbers in the prototype with no
 *    backing scoring endpoint in the current API — shipping them as real
 *    percentages would be fabricated data, so this card is omitted rather
 *    than faked. See docs/operations/mobile-ui-handoff-reconciliation.md.
 */

const STORY_ACTIONS = ['Develop this idea', 'Strengthen conflict', 'Explore another ending', 'Make this funnier', 'Increase tension'];

export function StoryScreen({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const isR16 = useR16();
  const [selected, setSelected] = useState<number | null>(null);

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  if (workspaceQuery.isLoading) {
    return (
      <Shell backHref={`/story-playground/${projectId}`} title="Story" activeTab="story" projectId={projectId}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      </Shell>
    );
  }

  const project = (workspaceQuery.data as any)?.project;
  const chapters: any[] = project?.chapters ?? [];
  const latestChapter = chapters[chapters.length - 1] ?? null;
  const paragraphs = splitParagraphs(latestChapter?.body);

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Story" activeTab="story" projectId={projectId}>
      <div style={{ padding: '18px 18px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!latestChapter ? (
          <EmptyState title="No chapters yet" hint="Start writing from the project overview." />
        ) : (
          <>
            <div>
              <span className="noc-label">
                Chapter {latestChapter.chapterNumber} · {latestChapter.title}
              </span>
              {!isR16 && (
                <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', marginTop: 6 }}>Tap any paragraph to direct it.</p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paragraphs.map((paragraph, i) => {
                const isSelected = selected === i;
                return (
                  <div key={i}>
                    <button
                      type="button"
                      disabled={isR16}
                      onClick={() => setSelected((s) => (s === i ? null : i))}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        fontSize: 17,
                        lineHeight: 1.72,
                        color: 'var(--noc-t2)',
                        padding: '11px 12px',
                        borderRadius: 12,
                        border: 'none',
                        background: isSelected ? 'rgba(178,90,217,0.12)' : 'transparent',
                        cursor: isR16 ? 'default' : 'pointer',
                      }}
                    >
                      {paragraph}
                    </button>
                    {isSelected && !isR16 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 12px 0' }}>
                        {STORY_ACTIONS.map((action) => (
                          <span
                            key={action}
                            title="Coming soon — not yet wired to a rewrite endpoint"
                            style={{
                              fontSize: 12.5,
                              padding: '9px 13px',
                              borderRadius: 999,
                              background: 'rgba(178,90,217,0.14)',
                              border: '1px solid rgba(178,90,217,0.32)',
                              color: 'var(--noc-lavender-tint)',
                              opacity: 0.6,
                              cursor: 'default',
                            }}
                          >
                            {action}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
