/**
 * Raivstream 5.0 — Story Intelligence adapter.
 *
 * Bridges the NEW semantic layer to the EXISTING story-intelligence
 * infrastructure (`lib/storyIntelligence` — StoryBlueprint/DirectedScene) and
 * the existing narrative engine. The 5.0 layer must never duplicate it.
 *
 * For the Phase-0/1 vertical slice this adapter is a thin typed seam; it is
 * exercised when a CreativeProject is bridged to a legacy StoryProject
 * (`legacyStoryProjectId`). It stays fail-soft: never blocks creative creation.
 */

import type { PrismaClient } from '@raivstream/database';
import { storyIntelligenceProvider } from '../../storyIntelligence';
import type { CreativeBriefState } from '../shared/types';

export interface StoryIntelligenceResult {
  provider: string;
  blueprint?: Record<string, unknown>;
  scenes?: Record<string, unknown>[];
}

/**
 * Plan a story foundation from the creative brief using the existing story
 * intelligence provider. Returns null when the underlying provider cannot run
 * (feature off / not configured) so the caller keeps the deterministic path.
 */
export async function planStoryFromBrief(
  prisma: PrismaClient,
  brief: CreativeBriefState,
  audienceMode?: string,
): Promise<StoryIntelligenceResult | null> {
  const idea = brief.originalIntent || brief.refinedIntent || '';
  if (!idea) return null;
  try {
    if (process.env.STORY_INTELLIGENCE_V1_ENABLED !== 'true') return null;
    const blueprint = await storyIntelligenceProvider.planStory({
      idea,
      answers: [],
      audienceMode: (audienceMode as 'KIDS' | 'GENERAL') ?? 'GENERAL',
    });
    void prisma;
    return {
      provider: storyIntelligenceProvider.name,
      blueprint: blueprint as unknown as Record<string, unknown>,
    };
  } catch (error) {
    console.warn('[creative.storyAdapter] planStory failed — keeping deterministic path:', (error as Error).message);
    return null;
  }
}