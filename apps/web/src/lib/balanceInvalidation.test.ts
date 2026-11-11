import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spendsCredits } from '../components/providers/TRPCProvider';

/**
 * Balance invalidation for every spending mutation (2026-11-11).
 *
 * The read found no mutation invalidating `user.creditBalance` anywhere - fifteen server-side
 * spending sites and nineteen client call sites, with the pill compensating by refetching on focus
 * and on an interval. A per-call-site fix leaves nineteen places to forget and a twentieth for the
 * next caller, so the invalidation sits on the MutationCache, keyed by mutation path, where a
 * caller cannot skip it.
 */

const SOURCE = readFileSync(join(__dirname, '..', 'components', 'providers', 'TRPCProvider.tsx'), 'utf8');

const mutation = (path: string) => ({ options: { mutationKey: path.split('.') } });

describe('which mutations spend credits', () => {
  it('recognises every enumerated spending path', () => {
    for (const path of [
      'generation.create',
      'generation.publish',
      'story.generateStory',
      'story.continueStory',
      'story.generateScenes',
      'story.generateSceneImage',
      'story.regenerateSceneImage',
      'story.generateSceneShotClips',
      'story.generateStoryNarration',
      'director.compose',
      'creative.project.auto',
      'creative.director.regenerateShot',
      'admin.adjustCredits',
    ]) {
      expect(spendsCredits(mutation(path))).toBe(true);
    }
  });

  it('leaves a read-only mutation alone', () => {
    expect(spendsCredits(mutation('user.creditBalance'))).toBe(false);
    expect(spendsCredits(mutation('academy.listMyCourses'))).toBe(false);
  });

  it('is not fooled by a mutation without a key', () => {
    expect(spendsCredits({ options: {} })).toBe(false);
  });
});

describe('the invalidation cannot be bypassed at a caller', () => {
  it('lives on the MutationCache, not on a mutation site', () => {
    expect(SOURCE).toContain('mutationCache: new MutationCache({');
    expect(SOURCE).toContain('if (spendsCredits(mutation as never))');
    expect(SOURCE).toContain("queryKey: [['user', 'creditBalance']]");
  });

  it('covers each server-side charge family, so the list can be audited', () => {
    // chargeOrThrow: newTake + production runner; deductCredits: generation, story, director,
    // audio; plus the admin balance adjustment.
    for (const family of ['generation.', 'story.', 'director.', 'creative.', 'admin.adjustCredits']) {
      expect(SOURCE).toContain(family);
    }
  });

  it('the pill keeps its interval as the safety net for background charges', () => {
    const pill = readFileSync(join(__dirname, '..', 'components', 'credits', 'CreditBalancePill.tsx'), 'utf8');
    expect(pill).toContain('refetchInterval');
  });
});
