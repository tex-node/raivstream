import { describe, it, expect } from 'vitest';
import { planConcat, buildConcatList } from '../shotConcat';

/**
 * Ordering and eligibility are the parts most likely to be wrong: a gap in
 * shotIndex would stitch 1,3,4 into a video that looks complete and is missing a
 * beat of the story. These tests pin that refusal.
 */

function clip(shotIndex: number | null, status = 'READY', assetUrl: string | null = `https://cdn/s${shotIndex}.mp4`) {
  return { id: `c${shotIndex}`, shotIndex, status, assetUrl };
}

describe('planConcat', () => {
  it('orders clips by shotIndex regardless of input order', () => {
    const plan = planConcat([clip(2), clip(0), clip(1)]);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.ordered.map((c) => c.shotIndex)).toEqual([0, 1, 2]);
  });

  it('refuses a gap in the sequence', () => {
    const plan = planConcat([clip(0), clip(2), clip(3)]);
    expect(plan).toEqual({ ok: false, reason: 'missing_shot' });
  });

  it('refuses while any clip is still rendering', () => {
    const plan = planConcat([clip(0), clip(1, 'GENERATING')]);
    expect(plan).toEqual({ ok: false, reason: 'still_rendering' });
  });

  it('refuses a single clip - nothing to stitch', () => {
    expect(planConcat([clip(0)])).toEqual({ ok: false, reason: 'not_enough_clips' });
  });

  it('refuses when no clip has a URL', () => {
    expect(planConcat([clip(0, 'READY', null)])).toEqual({ ok: false, reason: 'no_clips' });
  });

  it('refuses clips without a shotIndex rather than guessing an order', () => {
    const plan = planConcat([clip(0), clip(null)]);
    expect(plan).toEqual({ ok: false, reason: 'missing_shot' });
  });
});

describe('buildConcatList', () => {
  it('writes one quoted file line per path', () => {
    expect(buildConcatList(['/tmp/a.mp4', '/tmp/b.mp4'])).toBe(
      "file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n",
    );
  });

  it('escapes single quotes so a path cannot break out of the list syntax', () => {
    expect(buildConcatList(["/tmp/it's.mp4"])).toContain("it'\\''s");
  });
});
