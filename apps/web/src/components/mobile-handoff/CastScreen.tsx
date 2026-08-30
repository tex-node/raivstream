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
 * instead of beside it, a normal desktop cast-grid pattern. Layout axis
 * (row vs. column) moves to Tailwind classes so it can vary by breakpoint;
 * colors/sizes that don't need to vary stay inline, unchanged.
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
      <div className="lg:max-w-[1280px] lg:mx-auto lg:!px-10 lg:!py-10" style={{ padding: '14px 18px 32px' }}>
        {workspaceQuery.isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={72} radius={16} />
            <Skeleton height={72} radius={16} />
          </div>
        ) : characters.length === 0 ? (
          <EmptyState title="No characters yet" hint="Add your cast to bring the story to life." />
        ) : (
          <div className="lg:!grid lg:grid-cols-2 xl:grid-cols-3 wide:grid-cols-4 lg:!gap-4" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {characters.map((character) => (
              <Link
                key={character.id}
                href={`/story-playground/${projectId}/characters/${character.id}`}
                className="noc-pressable lg:flex-col lg:items-center lg:text-center lg:!gap-3 lg:!p-5"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderRadius: 16,
                  border: '1px solid transparent',
                  textDecoration: 'none',
                }}
              >
                <div
                  className="lg:!w-20 lg:!h-20 lg:!text-2xl"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: gradientPlaceholder(character.id),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--noc-t1)',
                  }}
                >
                  {character.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="lg:min-w-0 lg:w-full" style={{ flex: 1, minWidth: 0 }}>
                  <div className="lg:flex-col lg:!gap-0.5" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--noc-t1)' }}>{character.name}</span>
                    {character.role && (
                      <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--noc-t6)', letterSpacing: '0.06em' }}>{character.role}</span>
                    )}
                  </div>
                  {character.visualDescription && (
                    <p className="lg:!whitespace-normal lg:line-clamp-2" style={{ fontSize: 12.5, color: 'var(--noc-t5)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          className="lg:max-w-xs"
          style={{
            display: 'block',
            textAlign: 'center',
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
