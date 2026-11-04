import { describe, expect, it } from 'vitest';
import { routeProduction } from '../capabilityRouter';
import { buildCreativePlan } from '../plan';

/**
 * Per-shot specs carry the same conditioning as the composite (2026-11-04).
 *
 * A live run logged `references=0 framingInPrompt=false` for a per-shot still even with the
 * bible passed, and the previous session concluded the per-shot branch "never carries character
 * references". Reading both branches side by side shows they build `characterRefs` identically,
 * and a direct comparison against a real project returned refs=2 and 4 resolved references for
 * BOTH arms. So the earlier claim was wrong, and this test pins the property that claim denied.
 */

const bible = {
  characters: [
    { name: 'Lighthouse Keeper', visualDescription: 'a weathered man in his sixties' },
    { name: 'Lost Bird', visualDescription: 'a small gull with a banded leg' },
  ],
} as never;

const plan = buildCreativePlan({
  projectType: 'STORY' as never,
  brief: { originalIntent: 'A lighthouse keeper finds a lost bird' } as never,
  bible,
});

describe('the per-shot branch conditions exactly like the composite', () => {
  const composite = (routeProduction(plan, bible) as unknown as Array<Record<string, unknown>>).filter((s) => s.kind === 'IMAGE');
  const perShot = (routeProduction(plan, bible, null, { perShot: true }) as unknown as Array<Record<string, unknown>>).filter(
    (s) => s.kind === 'IMAGE',
  );

  it('both arms resolve a non-empty characterRefs list', () => {
    expect((composite[0].characterRefs as unknown[]).length).toBeGreaterThan(0);
    expect((perShot[0].characterRefs as unknown[]).length).toBeGreaterThan(0);
  });

  it('the per-shot refs are the SAME refs as the composite, not a parallel resolution', () => {
    expect(perShot[0].characterRefs).toEqual(composite[0].characterRefs);
  });

  it('a shot spec still names its shot, so conditioning did not replace addressing', () => {
    expect(typeof perShot[0].shotId).toBe('string');
    expect(String(perShot[0].prompt)).not.toBe(String(composite[0].prompt));
  });

  it('a scene whose characters the bible cannot match yields empty refs in BOTH arms', () => {
    const unmatched = buildCreativePlan({
      projectType: 'STORY' as never,
      brief: { originalIntent: 'A lighthouse keeper finds a lost bird' } as never,
      bible: { characters: [] } as never,
    });
    const c = (routeProduction(unmatched, { characters: [] } as never) as unknown as Array<Record<string, unknown>>).filter((s) => s.kind === 'IMAGE');
    const p = (routeProduction(unmatched, { characters: [] } as never, null, { perShot: true }) as unknown as Array<Record<string, unknown>>).filter(
      (s) => s.kind === 'IMAGE',
    );
    expect((c[0].characterRefs as unknown[] | undefined) ?? []).toHaveLength(0);
    expect((p[0].characterRefs as unknown[] | undefined) ?? []).toHaveLength(0);
  });
});
