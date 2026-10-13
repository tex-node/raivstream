'use client';

import { Shell } from '@/components/layout/Shell';
import { Accordion, Skeleton, optionLabel } from '@/components/mobile/primitives';
import { gradientPlaceholder } from '@/lib/mobileFormat';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';
import { useState } from 'react';
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
  const isR16 = useR16();
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
      <div className="px-[18px] pt-5 pb-8 lg:px-10 lg:py-10 lg:max-w-[1120px] lg:mx-auto lg:grid lg:grid-cols-[280px_1fr] lg:gap-10 lg:items-start">
        <div className="flex flex-col items-center text-center gap-1 mb-5 lg:sticky lg:top-24">
          <div
            className="w-[84px] h-[84px] text-[28px] lg:w-32 lg:h-32 lg:text-4xl flex items-center justify-center"
            style={{
              borderRadius: '50%',
              background: gradientPlaceholder(character.id),
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
          {isR16 && <CharacterReferencePanel characterId={character.id} name={character.name} />}
          {/* Track D Layer 2 — locked identity block (all audiences). */}
          <CharacterIdentityPanel
            characterId={character.id}
            name={character.name}
            frozenAt={character.identityFrozenAt ?? null}
            isR16={isR16}
          />
        </div>
      </div>
    </Shell>
  );
}

/**
 * R16-03 — canonical reference for a character. Plain copy, no prompt/provider/
 * model/credit terms. The latest READY reference is shown; approval is explicit.
 */
function CharacterReferencePanel({ characterId, name }: { characterId: string; name: string }) {
  const utils = trpc.useUtils();
  const list = trpc.story.listCharacterReferences.useQuery({ characterId });
  const refetch = () => utils.story.listCharacterReferences.invalidate({ characterId });
  const gen = trpc.story.generateCharacterReference.useMutation({ onSuccess: refetch });
  const approve = trpc.story.approveCharacterReference.useMutation({ onSuccess: refetch });
  const revoke = trpc.story.revokeCharacterApproval.useMutation({ onSuccess: refetch });

  const refs = list.data?.references ?? [];
  const approved = refs.find((r) => r.isApproved) ?? null;
  const latestReady = refs.find((r) => r.status === 'READY') ?? null;
  const shown = approved ?? latestReady;
  const busy = gen.isPending || approve.isPending || revoke.isPending;
  const err = gen.error || approve.error || revoke.error;
  const btn = { fontSize: 12.5, padding: '9px 13px' } as const;

  return (
    <div style={{ borderRadius: 16, border: '1px solid rgba(233,233,237,0.12)', padding: 14 }}>
      <span className="noc-label">This is what {name} looks like</span>
      <div style={{ marginTop: 10 }}>
        {shown?.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.assetUrl} alt={`${name} reference`} style={{ width: '100%', maxWidth: 220, borderRadius: 12, display: 'block' }} />
        ) : (
          <div style={{ width: 140, height: 140, borderRadius: 12, background: gradientPlaceholder(characterId) }} />
        )}
      </div>
      {approved?.createdAt && (
        <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', marginTop: 8 }}>
          Looks right · {new Date(approved.createdAt).toLocaleDateString()}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {!shown && (
          <button type="button" disabled={busy} onClick={() => gen.mutate({ characterId })} className="noc-btn-outline" style={btn}>
            {gen.isPending ? 'Making it…' : 'Make a picture'}
          </button>
        )}
        {shown && !approved && (
          <button type="button" disabled={busy} onClick={() => approve.mutate({ characterId, assetId: shown.id })} className="noc-btn-outline" style={btn}>
            Looks right!
          </button>
        )}
        {shown && (
          <button type="button" disabled={busy} onClick={() => gen.mutate({ characterId })} className="noc-btn-outline" style={btn}>
            {gen.isPending ? 'Making it…' : 'Try again'}
          </button>
        )}
        {approved && (
          <button type="button" disabled={busy} onClick={() => revoke.mutate({ characterId })} className="noc-btn-outline" style={btn}>
            Remove
          </button>
        )}
      </div>
      {err && <p style={{ fontSize: 12.5, color: '#e35d5d', marginTop: 6 }}>{err.message}</p>}
    </div>
  );
}

/**
 * Track D Layer 2 — locked identity block. Shows the exact string the model will
 * receive, lets the owner review/edit it, then freeze. Plain copy for R16; the
 * "locked" concept is separate from the R16-03 reference-image approval.
 */
function CharacterIdentityPanel({ characterId, name, frozenAt, isR16 }: { characterId: string; name: string; frozenAt: string | null; isR16: boolean }) {
  const utils = trpc.useUtils();
  const preview = trpc.story.previewCharacterIdentity.useQuery({ characterId });
  const refetch = () => utils.story.previewCharacterIdentity.invalidate({ characterId });
  const lock = trpc.story.lockCharacterIdentity.useMutation({ onSuccess: () => { setOpen(false); refetch(); } });
  const unlock = trpc.story.unlockCharacterIdentity.useMutation({ onSuccess: refetch });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const locked = Boolean(preview.data?.current);
  const busy = lock.isPending || unlock.isPending;
  const err = lock.error || unlock.error;
  const btn = { fontSize: 12.5, padding: '9px 13px' } as const;

  return (
    <div style={{ borderRadius: 16, border: '1px solid rgba(233,233,237,0.12)', padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="noc-label">{isR16 ? `${name} always looks the same` : `${name} identity lock`}</span>
        {locked && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(76,175,80,0.18)', color: '#4caf50' }}>
            Locked{frozenAt ? ` · ${new Date(frozenAt).toLocaleDateString()}` : ''}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--noc-t6)', marginTop: 8 }}>
        {isR16 ? 'They will always look like this in every picture.' : 'The exact description sent to the model on every generation.'}
      </p>

      {open && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            style={{ width: '100%', fontSize: 12.5, borderRadius: 10, padding: 8, background: 'transparent', border: '1px solid rgba(233,233,237,0.18)', color: 'var(--noc-t1)' }}
          />
          <p style={{ fontSize: 11.5, color: 'var(--noc-t6)', marginTop: 6 }}>This is exactly what will be sent to the model on every generation.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || !draft.trim()} onClick={() => lock.mutate({ characterId, block: draft.trim() })} className="noc-btn-outline" style={btn}>
              {lock.isPending ? 'Locking…' : 'Lock'}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="noc-btn-outline" style={btn}>Cancel</button>
          </div>
        </div>
      )}

      {!open && !locked && (
        <div style={{ marginTop: 10 }}>
          <button type="button" disabled={busy || preview.isLoading} onClick={() => { setDraft(preview.data?.composed ?? ''); setOpen(true); }} className="noc-btn-outline" style={btn}>
            Lock this character
          </button>
        </div>
      )}
      {!open && locked && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (typeof window === 'undefined' || window.confirm('Future generations will use the updated description. Existing images are unaffected.')) unlock.mutate({ characterId });
            }}
            className="noc-btn-outline"
            style={btn}
          >
            Unlock to edit
          </button>
        </div>
      )}
      {err && <p style={{ fontSize: 12.5, color: '#e35d5d', marginTop: 6 }}>{err.message}</p>}
    </div>
  );
}
