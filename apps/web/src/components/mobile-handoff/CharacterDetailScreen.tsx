'use client';

import { Shell } from '@/components/layout/Shell';
import { Accordion, Skeleton, optionLabel } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/**
 * Character detail — design_handoff_raivstream_mobile, screen 5 of 8.
 * Canonical: /story-playground/[projectId]/characters/[characterId].
 *
 * Responsive desktop reconciliation (Section 11): mobile keeps the exact
 * original single-column stack (portrait header, then every accordion
 * below it). At `lg:` and up this becomes a profile column (portrait,
 * sticky) + a details column (all accordions), instead of one long
 * scroll beneath the avatar.
 */

function chipsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? optionLabel(v) : String(v)));
  return [];
}

export function CharacterDetailScreen({ projectId, characterId }: { projectId: string; characterId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  useTrackTab(projectId, 'characters');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

  if (workspaceQuery.isLoading) {
    return (
      <Shell backHref={`/story-playground/${projectId}/characters`} title="Character" activeTab="characters" projectId={projectId}>
        <div style={{ padding: 18 }}>
          <Skeleton height={84} radius={999} width={84} />
        </div>
      </Shell>
    );
  }

  const characters: any[] = (workspaceQuery.data as any)?.project?.characterMemory ?? [];
  const character = characters.find((c) => c.id === characterId);

  if (!character) {
    return (
      <Shell backHref={`/story-playground/${projectId}/characters`} title="Character" activeTab="characters" projectId={projectId}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--noc-t4)' }}>Character not found.</p>
        </div>
      </Shell>
    );
  }

  const relationships: any[] = Array.isArray(character.relationships) ? character.relationships : [];

  return (
    <Shell backHref={`/story-playground/${projectId}/characters`} title={character.name} activeTab="characters" projectId={projectId}>
      <div className="lg:max-w-[1120px] lg:mx-auto lg:grid lg:grid-cols-[280px_1fr] lg:gap-10 lg:!px-10 lg:!py-10 lg:items-start" style={{ padding: '20px 18px 32px' }}>
        <div className="lg:sticky lg:top-24" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, marginBottom: 20 }}>
          <div
            className="lg:!w-32 lg:!h-32 lg:!text-4xl"
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              background: gradientPlaceholder(character.id),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 600,
              color: 'var(--noc-t1)',
            }}
          >
            {character.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <h1 style={{ fontSize: 21, fontWeight: 500, color: 'var(--noc-t1)', margin: '8px 0 0' }}>{character.name}</h1>
          {character.role && <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', margin: 0 }}>{character.role}</p>}
        </div>

        <div>
          <Accordion
            label="Appearance"
            hint="Kept consistent in every picture"
            body={character.visualDescription || 'No appearance description yet.'}
            chips={[character.species, character.ageDescription, character.gender].filter(Boolean)}
            defaultOpen
          />
          <Accordion
            label="Personality"
            hint="How they act and feel"
            body={chipsFrom(character.personalityTraits).join(', ') || 'No personality traits set yet.'}
            chips={chipsFrom(character.personalityTraits)}
          />
          <Accordion
            label="Motivation & goal"
            hint="What drives them forward"
            body={[character.motivation && optionLabel(character.motivation), character.goal && optionLabel(character.goal)].filter(Boolean).join(' — ') || 'Not set yet.'}
            chips={[character.motivation, character.goal].filter(Boolean).map((v) => optionLabel(v as string))}
          />
          <Accordion
            label="Fear"
            hint="The thing they avoid"
            body={character.fear ? optionLabel(character.fear) : 'Not set yet.'}
            chips={character.fear ? [optionLabel(character.fear)] : []}
          />
          <Accordion
            label="Relationships"
            hint="Who they're connected to"
            body={relationships.length > 0 ? relationships.map((r) => `${r.name} (${optionLabel(r.type)})`).join(', ') : 'No relationships added yet.'}
            chips={relationships.map((r) => r.name).filter(Boolean)}
          />
          <Accordion
            label="Movement style"
            hint="How they move and speak"
            body={[character.walkingStyle && optionLabel(character.walkingStyle), character.speakingStyle && optionLabel(character.speakingStyle)].filter(Boolean).join(' · ') || 'Not set yet.'}
            chips={[character.walkingStyle, character.speakingStyle].filter(Boolean).map((v) => optionLabel(v as string))}
          />
          <Accordion
            label="Evolution / arc"
            hint="How they change over the story"
            body={character.evolutionNotes || (character.evolutionStage ? optionLabel(character.evolutionStage) : 'No arc notes yet.')}
            chips={character.evolutionStage ? [optionLabel(character.evolutionStage)] : []}
          />
        </div>
      </div>
    </Shell>
  );
}
