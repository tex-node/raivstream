'use client';

import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

/** Characters list — design_handoff_raivstream_mobile, screen 4 of 8. Canonical: /story-playground/[projectId]/characters. */

export function CastScreen({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  const characters: any[] = (workspaceQuery.data as any)?.project?.characterMemory ?? [];

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Characters" activeTab="characters" projectId={projectId}>
      <div style={{ padding: '14px 18px 32px' }}>
        {workspaceQuery.isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={72} radius={16} />
            <Skeleton height={72} radius={16} />
          </div>
        ) : characters.length === 0 ? (
          <EmptyState title="No characters yet" hint="Add your cast to bring the story to life." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {characters.map((character) => (
              <Link
                key={character.id}
                href={`/story-playground/${projectId}/characters/${character.id}`}
                className="noc-pressable"
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--noc-t1)' }}>{character.name}</span>
                    {character.role && (
                      <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--noc-t6)', letterSpacing: '0.06em' }}>{character.role}</span>
                    )}
                  </div>
                  {character.visualDescription && (
                    <p style={{ fontSize: 12.5, color: 'var(--noc-t5)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
