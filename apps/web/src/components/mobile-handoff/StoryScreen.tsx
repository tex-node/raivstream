'use client';

import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState } from '@/components/mobile/primitives';
import { splitParagraphs } from '@/lib/mobileFormat';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

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
  useTrackTab(projectId, 'story');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );
  const utils = trpc.useUtils();
  const rewriteParagraph = trpc.story.rewriteParagraph.useMutation({
    onSuccess: () => {
      utils.story.getWorkspace.invalidate({ projectId });
      setSelected(null);
    },
  });
  const continueStory = trpc.story.continueStory.useMutation({
    onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }),
  });
  const completeStory = trpc.story.completeUnfinishedStory.useMutation({
    onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }),
  });
  const regenerateStoryText = trpc.story.regenerateStoryText.useMutation({
    onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }),
  });

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
  const summary = (workspaceQuery.data as any)?.summary;
  const chapters: any[] = project?.chapters ?? [];
  const latestChapter = chapters[chapters.length - 1] ?? null;
  const paragraphs = splitParagraphs(latestChapter?.body);
  const missingPictures = Math.max(0, (summary?.sceneCount ?? 0) - (summary?.readyImageCount ?? 0));
  const storyTruncated = Boolean(summary?.storyTruncated);

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Story" activeTab="story" projectId={projectId}>
      {/* Section 7: the app shell/workspace can be wide, but the reading
          column itself stays at an editorial width — a wide unconstrained
          text column is worse to read, not better, on a big screen. */}
      <div className="flex flex-col gap-[18px] px-[18px] pt-[18px] pb-8 lg:px-10 lg:py-10 lg:max-w-[760px] lg:mx-auto">
        {!latestChapter ? (
          <EmptyState title="No chapters yet" hint="Start writing from the project overview." />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <span className="noc-label">
                  Chapter {latestChapter.chapterNumber} · {latestChapter.title}
                </span>
                {!isR16 && (
                  <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', marginTop: 6 }}>Tap any paragraph to direct it.</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {storyTruncated && (
                  <button
                    type="button"
                    onClick={() => regenerateStoryText.mutate({ projectId })}
                    disabled={regenerateStoryText.isPending}
                    className="noc-btn-outline"
                    style={{ fontSize: 12.5, padding: '9px 13px', whiteSpace: 'nowrap', color: '#e35d5d', borderColor: 'rgba(227,93,93,0.4)' }}
                  >
                    {regenerateStoryText.isPending ? 'Regenerating…' : 'Regenerate story'}
                  </button>
                )}
                {!isR16 && missingPictures > 0 && (
                  <button
                    type="button"
                    onClick={() => completeStory.mutate({ projectId })}
                    disabled={completeStory.isPending}
                    className="noc-btn-outline"
                    style={{ fontSize: 12.5, padding: '9px 13px', whiteSpace: 'nowrap', color: 'var(--noc-purple)', borderColor: 'rgba(178,90,217,0.4)' }}
                  >
                    {completeStory.isPending
                      ? 'Completing…'
                      : `Complete story (${missingPictures} picture${missingPictures === 1 ? '' : 's'} missing)`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => continueStory.mutate({ projectId })}
                  disabled={continueStory.isPending}
                  className="noc-btn-outline"
                  style={{ fontSize: 12.5, padding: '9px 13px', whiteSpace: 'nowrap' }}
                >
                  {continueStory.isPending ? 'Adding…' : '+ Add Chapter'}
                </button>
              </div>
            </div>

            {storyTruncated && !regenerateStoryText.isPending && (
              <div style={{ borderRadius: 12, padding: 11, background: 'rgba(227,93,93,0.1)', border: '1px solid rgba(227,93,93,0.3)' }}>
                <p style={{ fontSize: 13, margin: 0, color: '#e35d5d' }}>
                  This story text was cut off mid-sentence. Tap “Regenerate story” to draft it to completion — your scenes and pictures are kept.
                </p>
              </div>
            )}
            {regenerateStoryText.isPending && (
              <div style={{ borderRadius: 12, padding: 11, background: 'rgba(79,139,214,0.1)', border: '1px solid rgba(79,139,214,0.3)' }}>
                <p style={{ fontSize: 13, margin: 0, color: 'var(--noc-blue)' }}>Rewriting the full story…</p>
              </div>
            )}

            {completeStory.data && (completeStory.data.generated > 0 || completeStory.data.failed > 0) && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 11,
                  background: completeStory.data.failed > 0 ? 'rgba(227,93,93,0.1)' : 'rgba(79,139,214,0.1)',
                  border: `1px solid ${completeStory.data.failed > 0 ? 'rgba(227,93,93,0.3)' : 'rgba(79,139,214,0.3)'}`,
                }}
              >
                <p style={{ fontSize: 13, margin: 0, color: completeStory.data.failed > 0 ? '#e35d5d' : 'var(--noc-blue)' }}>
                  {completeStory.data.generated > 0
                    ? `Generated ${completeStory.data.generated} missing picture${completeStory.data.generated === 1 ? '' : 's'}.`
                    : ''}
                  {completeStory.data.failed > 0 ? ` ${completeStory.data.failed} could not be generated — open its Scene Director and retry.` : ''}
                  {completeStory.data.scenes
                    ?.filter((s: any) => s.status === 'FAILED')
                    .map((s: any) => s.title)
                    .join(', ')}
                </p>
              </div>
            )}

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
                          <button
                            key={action}
                            type="button"
                            disabled={rewriteParagraph.isPending}
                            onClick={() => rewriteParagraph.mutate({ projectId, chapterId: latestChapter.id, paragraphIndex: i, directive: action })}
                            style={{
                              fontSize: 12.5,
                              padding: '9px 13px',
                              borderRadius: 999,
                              background: 'rgba(178,90,217,0.14)',
                              border: '1px solid rgba(178,90,217,0.32)',
                              color: 'var(--noc-lavender-tint)',
                              cursor: rewriteParagraph.isPending ? 'default' : 'pointer',
                              opacity: rewriteParagraph.isPending ? 0.5 : 1,
                            }}
                          >
                            {action}
                          </button>
                        ))}
                        {rewriteParagraph.isPending && (
                          <span style={{ fontSize: 12.5, color: 'var(--noc-t6)', alignSelf: 'center' }}>Rewriting…</span>
                        )}
                        {rewriteParagraph.error && (
                          <span style={{ fontSize: 12.5, color: '#e35d5d', alignSelf: 'center' }}>{rewriteParagraph.error.message}</span>
                        )}
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
