'use client';

import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/**
 * Characters list — design_handoff_raivstream_mobile, screen 4 of 8.
 * Canonical: /story-playground/[projectId]/characters.
 *
 * Responsive desktop reconciliation (Section 8): mobile keeps the exact
 * original row-list (avatar left, name/role/description right). At `lg:`
 * and up this becomes a responsive card grid — 2 cols at 1024, 3 at 1280,
 * 4 at wide (1440+) — with each card's avatar centered above its text
 * instead of beside it, a normal desktop cast-grid pattern.
 *
 * Every layout property that flips by breakpoint (display, flex-direction,
 * gap, padding, width/height, white-space) lives in `className`, not
 * inline `style` — inline style always wins a same-specificity class tie
 * regardless of source order, so a property that must vary by breakpoint
 * can never live there. Only breakpoint-invariant decoration (colors,
 * border, radius, font-weight) stays inline.
 */

export function CastScreen({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  useTrackTab(projectId, 'characters');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  const characters: any[] = (workspaceQuery.data as any)?.project?.characterMemory ?? [];

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Characters" activeTab="characters" projectId={projectId}>
      <div className="px-[18px] pt-3.5 pb-8 lg:px-10 lg:py-10 lg:max-w-[1280px] lg:mx-auto">
        {workspaceQuery.isLoading ? (
          <div className="flex flex-col gap-2.5">
            <Skeleton height={72} radius={16} />
            <Skeleton height={72} radius={16} />
          </div>
        ) : characters.length === 0 ? (
          <EmptyState title="No characters yet" hint="Add your cast to bring the story to life." />
        ) : (
          <div className="flex flex-col gap-1 lg:grid lg:grid-cols-2 xl:grid-cols-3 wide:grid-cols-4 lg:gap-4">
            {characters.map((character) => (
              <Link
                key={character.id}
                href={`/story-playground/${projectId}/characters/${character.id}`}
                className="noc-pressable flex items-center gap-3 p-2.5 lg:flex-col lg:items-center lg:text-center lg:gap-3 lg:p-5"
                style={{
                  borderRadius: 16,
                  border: '1px solid transparent',
                  textDecoration: 'none',
                }}
              >
                <div
                  className="w-14 h-14 text-lg flex items-center justify-center shrink-0 lg:w-20 lg:h-20 lg:text-2xl"
                  style={{
                    borderRadius: '50%',
                    background: gradientPlaceholder(character.id),
                    fontWeight: 600,
                    color: 'var(--noc-t1)',
                  }}
                >
                  {character.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0 lg:w-full">
                  <div className="flex items-baseline gap-2 lg:flex-col lg:gap-0.5">
                    <span style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--noc-t1)' }}>{character.name}</span>
                    {character.role && (
                      <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--noc-t6)', letterSpacing: '0.06em' }}>{character.role}</span>
                    )}
                  </div>
                  {character.visualDescription && (
                    <p
                      className="whitespace-nowrap overflow-hidden text-ellipsis lg:whitespace-normal lg:line-clamp-2"
                      style={{ fontSize: 12.5, color: 'var(--noc-t5)', margin: '2px 0 0' }}
                    >
                      {character.visualDescription}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link
          href={`/story-playground/${projectId}?tab=characters&legacy=1`}
          className="block text-center lg:max-w-xs"
          style={{
            minHeight: 48,
            lineHeight: '48px',
            marginTop: 12,
            borderRadius: 12,
            border: '1px dashed rgba(233,233,237,0.16)',
            color: 'var(--noc-t5)',
            fontSize: 13.5,
            textDecoration: 'none',
          }}
        >
          + Add a character
        </Link>
      </div>
    </Shell>
  );
}
