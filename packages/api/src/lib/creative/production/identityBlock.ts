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
  const rows = await (prisma as never as {
    characterReferenceAsset: {
      findMany: (args: unknown) => Promise<Array<{ assetUrl: string | null }>>;
    };
  }).characterReferenceAsset.findMany({
    where: {
      assetUrl: { not: null },
      status: 'READY',
      character: { name: { in: names.slice(0, MAX_REFERENCES) } },
    },
    orderBy: { createdAt: 'desc' },
    select: { assetUrl: true },
  });

  const urls: string[] = [];
  for (const row of rows) {
    if (typeof row.assetUrl === 'string' && row.assetUrl.length > 0 && !urls.includes(row.assetUrl)) urls.push(row.assetUrl);
    if (urls.length >= MAX_REFERENCES) break;
  }
  return urls;
}
