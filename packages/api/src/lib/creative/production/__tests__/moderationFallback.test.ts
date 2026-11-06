import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canSeedVideo, decideAfterRejection, netSpendAfterRefund } from '../moderationFallback';
import { finalRunStatus } from '../../../credits/cap';

/**
 * The moderation fallback (2026-11-06).
 *
 * A run lost a whole scene to one rejection: the still was flagged for graphic violence, and its
 * video then failed for want of a seed. The film was a scene short with nothing recording why.
 *
 * Shape: retry once with a softened prompt, then DROP the scene - recorded, so the run reports
 * PARTIAL rather than COMPLETED with a hole.
 */

describe('retry once, then drop', () => {
  it('the first rejection retries with the rewritten prompt', () => {
    const decision = decideAfterRejection({
      alreadyRetried: false,
      originalPrompt: 'A keeper finds an injured bird, blood on its wing',
      rewritten: 'A keeper finds a bird with a bandaged wing',
    });
    expect(decision.action).toBe('retry');
    expect(decision.action === 'retry' && decision.prompt).toBe('A keeper finds a bird with a bandaged wing');
  });

  it('a rewrite identical to the original is not a retry - it would be rejected again', () => {
    const decision = decideAfterRejection({
      alreadyRetried: false,
      originalPrompt: 'same prompt',
      rewritten: 'same prompt',
    });
    expect(decision.action).toBe('drop');
  });

  it('a missing or empty rewrite drops rather than retrying blind', () => {
    expect(decideAfterRejection({ alreadyRetried: false, originalPrompt: 'x', rewritten: null }).action).toBe('drop');
    expect(decideAfterRejection({ alreadyRetried: false, originalPrompt: 'x', rewritten: '   ' }).action).toBe('drop');
  });

  it('a second rejection drops the scene with a reason that says so', () => {
    const decision = decideAfterRejection({ alreadyRetried: true, originalPrompt: 'x', rewritten: 'y' });
    expect(decision.action).toBe('drop');
    expect(decision.action === 'drop' && decision.reason).toContain('after_retry');
  });
});

describe('a dropped scene is recorded, and does not break the seed chain', () => {
  it('a dropped scene cannot seed a video', () => {
    expect(canSeedVideo({ sceneDropped: true, stillReady: true })).toBe(false);
  });

  it('a ready still seeds a video', () => {
    expect(canSeedVideo({ sceneDropped: false, stillReady: true })).toBe(true);
  });

  it('a run with dropped scenes reports PARTIAL, never COMPLETED', () => {
    expect(finalRunStatus({ capHit: false, generated: 6, failed: 2, droppedScenes: 1 })).toBe('PARTIAL');
  });

  it('a run with no drops is still COMPLETED', () => {
    expect(finalRunStatus({ capHit: false, generated: 8, failed: 0, droppedScenes: 0 })).toBe('COMPLETED');
  });
});

describe('creditsSpent nets refunds so the cap counts real money', () => {
  it('a refunded charge comes off the run spend', () => {
    expect(netSpendAfterRefund(920, 80)).toBe(840);
  });

  it('never goes negative', () => {
    expect(netSpendAfterRefund(80, 200)).toBe(0);
  });

  it('the 920-vs-840 divergence from the real run is closed', () => {
    // the run charged 920 gross, refunded one 80 rejection, and should report 840 net
    expect(netSpendAfterRefund(920, 80)).toBe(840);
  });
});

describe('the runner wires all of it', () => {
  const source = readFileSync(join(__dirname, '..', 'runner.ts'), 'utf8');

  it('uses the fallback decision on rejection', () => {
    expect(source).toContain('decideAfterRejection({');
    expect(source).toContain('suggestSafeRewrite(');
  });

  it('nets the spend after a refund', () => {
    expect(source).toContain('netSpendAfterRefund(budget.spent, creditsUsed)');
  });

  it('records the drop and skips the video of a dropped scene', () => {
    expect(source).toContain('droppedScenes.add(spec.sceneId)');
    expect(source).toContain('action=skip_video reason=scene_dropped');
  });

  it('reports dropped scenes to the final status', () => {
    expect(source).toContain('droppedScenes: droppedScenes.size');
  });
});
