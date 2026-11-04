import { describe, expect, it, vi } from 'vitest';

/**
 * The identity disclosure (2026-11-04).
 *
 * The feed has excluded below-floor films since #277 with no explanation to the viewer. The
 * label must carry the same verdict the feed computes - `projectIdentity()` is the single
 * source of truth, called by both - and it must appear on BOTH cases: below-floor shows with
 * its number, above-floor shows nothing. A one-sided test is half a proof.
 */

import { videoRouter } from '../video';

function callerWith(opts: { sourceProjectId: string | null; scores: number[] }) {
  const prisma = {
    video: {
      findUnique: vi.fn(async () => ({ sourceProjectId: opts.sourceProjectId })),
    },
    creativeCriticRun: {
      findMany: vi.fn(async () => opts.scores.map((score) => ({ characterIdentityScore: score }))),
    },
  } as never;
  return videoRouter.createCaller({ prisma, user: null } as never);
}

describe('identity disclosure', () => {
  it('a below-floor film shows the label with its score and the floor', async () => {
    const result = await callerWith({ sourceProjectId: 'p1', scores: [90, 62, 78] }).identityDisclosure({ id: 'v1' });
    expect(result.belowFloor).toBe(true);
    expect(result.minIdentity).toBe(62);
    expect(result.floor).toBe(85);
    expect(result.scored).toBe(3);
  });

  it('an above-floor film shows nothing', async () => {
    const result = await callerWith({ sourceProjectId: 'p1', scores: [90, 88] }).identityDisclosure({ id: 'v1' });
    expect(result.belowFloor).toBe(false);
    expect(result.minIdentity).toBe(88);
  });

  it('an unsourced film is not scored, so there is nothing to disclose', async () => {
    const result = await callerWith({ sourceProjectId: null, scores: [] }).identityDisclosure({ id: 'v1' });
    expect(result.belowFloor).toBe(false);
    expect(result.minIdentity).toBeNull();
    expect(result.scored).toBe(0);
  });

  it('an unsafely-sourced film with no scores is not labelled below floor', async () => {
    const result = await callerWith({ sourceProjectId: 'p1', scores: [] }).identityDisclosure({ id: 'v1' });
    expect(result.belowFloor).toBe(false);
    expect(result.minIdentity).toBeNull();
  });
});