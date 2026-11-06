import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PreflightRefusedError, preflightDecision, preflightRecord } from '../preflight';

/**
 * Pre-flight moderation (2026-11-06).
 *
 * Moderation is free and generation is not, so the check belongs BEFORE the charge. This is the
 * recorded decision from the instrumentation session, and it was motivated by a free finding: in
 * run 4, SCENE_01's still was allowed while its video was flagged for the same scene text.
 */

describe('the decision', () => {
  it('an allowed prompt passes untouched - the common case is unchanged', () => {
    expect(preflightDecision({ initial: { allowed: true } as never, rewritten: null, alreadySoftened: false })).toEqual({
      action: 'pass',
    });
  });

  it('a rejected prompt with a rewrite available is softened, not refused', () => {
    const decision = preflightDecision({
      initial: { allowed: false, reason: 'violence', flaggedPhrase: 'finds an injured bird' } as never,
      rewritten: 'finds a bird with a bandaged wing',
      alreadySoftened: false,
    });
    expect(decision.action).toBe('softened');
    expect(decision.action === 'softened' && decision.prompt).toContain('bandaged');
  });

  it('a rejected prompt with no rewrite is refused, naming the reason and the phrase', () => {
    const decision = preflightDecision({
      initial: { allowed: false, reason: 'violence', flaggedPhrase: 'finds an injured bird' } as never,
      rewritten: null,
      alreadySoftened: false,
    });
    expect(decision.action).toBe('refuse');
    if (decision.action !== 'refuse') return;
    expect(decision.reason).toBe('violence');
    expect(decision.flaggedPhrase).toBe('finds an injured bird');
  });

  it('a second rejection refuses - one softening attempt, never a loop', () => {
    const decision = preflightDecision({
      initial: { allowed: false, reason: 'violence' } as never,
      rewritten: 'something else',
      alreadySoftened: true,
    });
    expect(decision.action).toBe('refuse');
  });

  it('the refusal error is typed and carries the kind', () => {
    const error = new PreflightRefusedError('VIDEO', 'violence', 'finds an injured bird');
    expect(error.code).toBe('PREFLIGHT_REFUSED');
    expect(error.kind).toBe('VIDEO');
    expect(error.flaggedPhrase).toBe('finds an injured bird');
  });

  it('the stored record names the kind and reason, without prompt text', () => {
    expect(preflightRecord('VIDEO', 'violence')).toBe('PREFLIGHT_REFUSED kind=VIDEO reason=violence');
  });
});

describe('the check sits before the charge', () => {
  const source = readFileSync(join(__dirname, '..', 'runner.ts'), 'utf8');

  it('the pre-flight runs before the ceiling guard and the charge', () => {
    const preflight = source.indexOf('preflightDecision({');
    const guard = source.indexOf('assertWithinCeiling({ runId, ceiling: budget.ceiling');
    const charge = source.indexOf('await chargeOrThrow(');
    expect(preflight).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(guard);
    expect(preflight).toBeLessThan(charge);
  });

  it('a refusal returns before any charge call for that asset', () => {
    expect(source).toContain('preflightRecord(spec.kind, decision.reason)');
    expect(source).toContain("console.info(`[creative.moderation] preflight=refused");
  });

  it('pre-flight softening is logged with a length, never the text', () => {
    expect(source).toContain('preflight=softened kind=');
    expect(source).toContain('softenedChars=');
  });
});
