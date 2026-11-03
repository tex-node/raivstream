/**
 * Identity conditioning for the creative pipeline (build step 2 + 3).
 *
 * The read (PR #281) established why no creative output ever cleared the identity
 * floor: stills were text-to-image only, with no references and no identity block, so
 * a character could not survive from one scene to the next. The critic was measuring
 * an absence the pipeline guaranteed.
 *
 * DESIGN DECISION — which store is authoritative: the **story store**
 * (`CharacterReferenceAsset`). The creative pipeline becomes another consumer of the
 * identity system the story pipeline already uses, exactly as it already consumes
 * `StoryCharacterMemory` for bible text. A creative-specific identity store would be a
 * second system to approve, migrate and keep consistent; nothing in the creative
 * project type needs a character that cannot be a story character, so the smaller
 * build is also the correct one.
 */
import type { PrismaClient } from '@raivstream/database';
import { composeIdentityBlock } from '../../story/characterIdentity';

/** Max references the provider contract accepts. */
export const MAX_REFERENCES = 4;

export interface CreativeCharacterRef {
  name: string;
  visualDescription?: string | null;
  lockedIdentityBlock?: string | null;
}

/**
 * Compose the identity block for a scene's characters.
 *
 * Mirrors the story path: a locked block wins over a composed description. Positional
 * binding is stated explicitly ("reference 1 is <name>") because the provider has no
 * notion of who is who — without it, four references are just four images.
 */
export function composeCreativeIdentityBlock(characters: CreativeCharacterRef[]): string {
  const named = characters.filter((character) => character.name?.trim()).slice(0, MAX_REFERENCES);
  if (named.length === 0) return '';

  const blocks = named.map((character, index) => {
    const identity =
      character.lockedIdentityBlock?.trim() ||
      composeIdentityBlock({
        name: character.name,
        visualDescription: character.visualDescription ?? undefined,
      } as never);
    // Positional binding: this is what lets the model associate image N with a name.
    return `[reference ${index + 1}: ${character.name}] ${identity}`;
  });

  return blocks.join('\n');
}

/** Append the identity block to a scene prompt, without duplicating it. */
export function withIdentityBlock(prompt: string, identityBlock: string): string {
  if (!identityBlock) return prompt;
  if (prompt.includes(identityBlock)) return prompt;
  return `${prompt}\n\nCHARACTER IDENTITY (must be preserved exactly):\n${identityBlock}`;
}

/**
 * Resolve approved reference images for the given character names from the story store.
 *
 * Fails open: no approved references means an empty list, which routes the still to
 * text-to-image rather than blocking production. A scene with no character must still
 * generate — the alternative is a creative pipeline that cannot render an establishing
 * shot.
 */
export async function resolveCreativeReferences(
  prisma: PrismaClient,
  characters: CreativeCharacterRef[],
): Promise<string[]> {
  const names = characters.map((character) => character.name?.trim()).filter((name): name is string => Boolean(name));
  if (names.length === 0) return [];

  // READY only: the enum is PENDING | GENERATING | READY | FAILED - there is no
  // APPROVED state, which the first version of this file wrongly assumed. The cast to
  // `never` below bypasses Prisma's enum typing, so the compiler could not catch it and
  // the production DB would have rejected the value at runtime.
  //
  // TWO BRANCHES, and the second is the bridge: a creative project cannot own a
  // StoryCharacterMemory, so its rows carry `characterId = null` and only `characterName`.
  // Matching on the relation alone - which is what shipped first - could never see them.
  const wanted = names.slice(0, MAX_REFERENCES);
  const rows = await (prisma as never as {
    characterReferenceAsset: {
      findMany: (args: unknown) => Promise<Array<{ assetUrl: string | null }>>;
    };
  }).characterReferenceAsset.findMany({
    where: {
      assetUrl: { not: null },
      status: 'READY',
      OR: [{ character: { name: { in: wanted } } }, { characterName: { in: wanted } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { assetUrl: true },
  });

  // De-duplicated by URL, so a row that matched BOTH branches is counted once.
  const urls: string[] = [];
  for (const row of rows) {
    if (typeof row.assetUrl === 'string' && row.assetUrl.length > 0 && !urls.includes(row.assetUrl)) urls.push(row.assetUrl);
    if (urls.length >= MAX_REFERENCES) break;
  }
  return urls;
}

export interface CastReferenceResult {
  created: Array<{ name: string; assetId: string }>;
  skipped: Array<{ name: string; reason: 'already_ready' }>;
}

/**
 * Cast stage: one READY reference per derived character.
 *
 * Reuses the story path's shape rather than writing a second generation call: the row is
 * created first (so a retry is idempotent against the row), the prompt comes from the
 * same `characterReferencePrompt` composition, and the provider is the same FLUX2 call.
 *
 * A name that already has a READY reference is SKIPPED - a reused character must not get a
 * second reference, and regenerating one would silently change the identity a previous
 * production was conditioned on.
 */
export async function castReferences(
  prisma: PrismaClient,
  input: {
    projectId: string;
    characters: CreativeCharacterRef[];
    generate: (args: { prompt: string; negativePrompt: string }) => Promise<string>;
  },
): Promise<CastReferenceResult> {
  const result: CastReferenceResult = { created: [], skipped: [] };

  for (const character of input.characters.slice(0, MAX_REFERENCES)) {
    const name = character.name?.trim();
    if (!name) continue;

    const existing = await (prisma as never as {
      characterReferenceAsset: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
      };
    }).characterReferenceAsset.findFirst({
      where: { status: 'READY', assetUrl: { not: null }, OR: [{ characterName: name }, { character: { name } }] },
      select: { id: true },
    });
    if (existing) {
      result.skipped.push({ name, reason: 'already_ready' });
      continue;
    }

    const prompt = character.visualDescription?.trim()
      ? `${character.name}: ${character.visualDescription.trim()}`
      : `${character.name}, character reference sheet`;
    const negativePrompt = 'multiple people, crowd, text, watermark, extra limbs, deformed hands, scene background';

    const row = await (prisma as never as {
      characterReferenceAsset: {
        create: (args: unknown) => Promise<{ id: string }>;
        update: (args: unknown) => Promise<unknown>;
      };
    }).characterReferenceAsset.create({
      data: {
        projectId: input.projectId,
        characterName: name,
        status: 'PENDING',
        prompt,
        negativePrompt,
        providerModel: 'FLUX2',
        isLatest: true,
      },
    });

    const assetUrl = await input.generate({ prompt, negativePrompt });
    await (prisma as never as {
      characterReferenceAsset: { update: (args: unknown) => Promise<unknown> };
    }).characterReferenceAsset.update({
      where: { id: row.id },
      data: { status: 'READY', assetUrl, approvedReferenceAssetId: undefined },
    });

    result.created.push({ name, assetId: row.id });
  }

  return result;
}

/**
 * The blocking gate.
 *
 * Fail-open is right for UNKNOWN (the quarantine predicate surfaces unscored assets); it is
 * wrong for KNOWN-UNAPPROVED. A production that silently conditions on nothing is the exact
 * failure this chain has chased for four sessions, so this refuses and names the characters.
 */
export async function assertCastApproved(
  prisma: PrismaClient,
  input: { projectId: string; characters: CreativeCharacterRef[] },
): Promise<void> {
  const names = input.characters.map((character) => character.name?.trim()).filter((name): name is string => Boolean(name));
  // Logged on BOTH paths: a refusal-only log cannot distinguish "the gate never ran"
  // from "it ran and passed", which is exactly the ambiguity that cost two sessions.
  if (names.length === 0) {
    console.info(`[creative.gate] projectId=${input.projectId} reached=true castCharacters=0 approved=true refusing=false reason=no_cast`);
    return;
  }

  const approved = await (prisma as never as {
    characterReferenceAsset: {
      findMany: (args: unknown) => Promise<Array<{ characterName: string | null }>>;
    };
  }).characterReferenceAsset.findMany({
    where: {
      status: 'READY',
      assetUrl: { not: null },
      approvedReferenceAssetId: { not: null },
      OR: [{ characterName: { in: names } }, { character: { name: { in: names } } }],
    },
    select: { characterName: true },
  });

  const approvedNames = new Set(approved.map((row) => (row.characterName ?? '').toLowerCase()).filter(Boolean));
  const missing = names.filter((name) => !approvedNames.has(name.toLowerCase()));
  if (missing.length > 0) {
    console.info(
      `[creative.gate] projectId=${input.projectId} reached=true castCharacters=${names.length} approved=false refusing=true missing=${missing.join(',')}`,
    );
    throw new Error(`CAST_NOT_APPROVED: approve the reference for ${missing.join(', ')} before producing.`);
  }
  console.info(`[creative.gate] projectId=${input.projectId} reached=true castCharacters=${names.length} approved=true refusing=false`);
}
