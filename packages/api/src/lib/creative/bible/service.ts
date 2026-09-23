/**
 * Raivstream 5.0 — Creative Bible service.
 *
 * BIBLE = what Raivstream knows and must preserve. Constructed from:
 *   Original Intent + Intent Interpretation + Domain Intelligence + User Decisions.
 * Evolution rule (roadmap §10 / prompt §27):
 *   ASSUMPTION → PROPOSED DECISION → CREATOR APPROVAL → CANON.
 * A rejected idea is recorded in memory and never silently reintroduced.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeBibleEnabled } from '../featureFlags';
import type { CreativeBibleState, CreativeInterpretation } from '../shared/types';
import { domainKnowledgeFor } from '../intelligence/service';

export function buildSeedBible(interpretation: CreativeInterpretation): CreativeBibleState {
  const knowledge = domainKnowledgeFor(interpretation);
  return {
    version: 1,
    story: knowledge.story,
    characters: knowledge.characters ?? [],
    worlds: knowledge.worlds ?? [],
    visualLanguage: knowledge.visualLanguage ?? { style: 'cinematic' },
    audioLanguage: undefined,
    audience: knowledge.audience,
    brand: knowledge.brand,
    constraints: {
      note: 'AI assumptions are proposed, not canon. Creator approval promotes them to canon.',
    },
    canon: {
      originalIntent: interpretation.explicit,
      confirmed: [],
    },
  };
}

export async function seedBibleFromInterpretation(
  prisma: PrismaClient,
  projectId: string,
  interpretation: CreativeInterpretation,
): Promise<CreativeBibleState> {
  if (!isCreativeBibleEnabled()) return buildSeedBible(interpretation);
  const bible = buildSeedBible(interpretation);
  await prisma.creativeBible.create({
    data: {
      projectId,
      version: bible.version,
      story: bible.story as never,
      characters: (bible.characters ?? []) as never,
      worlds: (bible.worlds ?? []) as never,
      visualLanguage: bible.visualLanguage as never,
      audioLanguage: bible.audioLanguage as never,
      audience: bible.audience as never,
      brand: bible.brand as never,
      constraints: bible.constraints as never,
      canon: bible.canon as never,
    },
  });
  return bible;
}

/** Merge a proposed decision into the bible canon after creator approval. */
export async function confirmDecision(
  prisma: PrismaClient,
  input: { projectId: string; label: string; value: Record<string, unknown> },
): Promise<void> {
  const bible = await prisma.creativeBible.findUnique({ where: { projectId: input.projectId } });
  if (!bible) return;
  const canon = (bible.canon as { originalIntent?: unknown; confirmed?: Array<Record<string, unknown>> } | null) ?? {};
  const confirmed = canon.confirmed ?? [];
  confirmed.push({ label: input.label, value: input.value, confirmedAt: new Date().toISOString() });
  await prisma.creativeBible.update({
    where: { id: bible.id },
    data: { canon: { ...canon, confirmed } as never, version: { increment: 1 } },
  });
}