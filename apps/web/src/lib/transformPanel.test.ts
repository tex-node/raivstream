import { describe, expect, it } from 'vitest';
import {
  TRANSFORM_TIMEOUT_MS, elapsedLabel, formatTransformCost, instructionGuidance, instructionPlaceholder,
  noChangeCaveat, provenanceLine, timedOut, timeoutCopy, transformErrorCopy,
} from './transformPanel';

/**
 * The transformation surface's rules (2026-11-16).
 *
 * Every assertion here traces to a measured result or a typed refusal, not to taste: the 72.8-95.3 s polls, the
 * 15-vs-85 style pair, and the refund behaviour that makes "nothing was charged" true.
 */
describe('the surface shows what the measurements say', () => {
  it('cost copy comes from the quote, not a constant', () => {
    expect(formatTransformCost({ credits: 1578, billedSeconds: 6 })).toBe('1,578 credits · 6s billed');
    expect(formatTransformCost(undefined)).toBe('Checking price…');
  });

  it('progress is visible from the first second', () => {
    const start = 1_000_000;
    expect(elapsedLabel(start, start)).toBe('Working… 0s');
    expect(elapsedLabel(start, start + 12_000)).toBe('Working… 12s');
    // The measured poll was 72.8-95.3 s, so the minute form must exist.
    expect(elapsedLabel(start, start + 95_000)).toBe('Working… 1m 35s');
    expect(elapsedLabel(null, start)).toBeNull();
  });

  it('the 10-minute cap surfaces as a timeout, not a hang', () => {
    const start = 1_000_000;
    expect(timedOut(start, start + TRANSFORM_TIMEOUT_MS - 1)).toBe(false);
    expect(timedOut(start, start + TRANSFORM_TIMEOUT_MS)).toBe(true);
    expect(timeoutCopy()).toMatch(/Nothing was charged/);
  });

  it('restyle carries the no-change caveat; relight does not need it', () => {
    // The measured pair: styleChange 15 on a balanced grade, 85 on a blunt one.
    expect(noChangeCaveat('restyle')).toMatch(/no-change outcome/);
    expect(noChangeCaveat('relight')).toBeNull();
  });

  it('guidance names the pattern that measured 85, for both operations', () => {
    expect(instructionGuidance('restyle')).toMatch(/monochrome/);
    expect(instructionGuidance('relight')).toMatch(/key light/);
    expect(instructionPlaceholder('restyle')).toMatch(/Monochrome/);
  });

  it('every typed refusal reads as creator language, never a code', () => {
    for (const raw of [
      'TRANSFORM_DURATION_REQUIRED: x',
      'TRANSFORM_RATE_MISSING: no relight rate',
      'TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED: none',
      'TRANSFORM_BODY_INVALID: x',
      'something else entirely',
    ]) {
      const copy = transformErrorCopy(raw);
      expect(copy).not.toMatch(/TRANSFORM_/);
      expect(copy.length).toBeGreaterThan(20);
    }
    expect(transformErrorCopy('TRANSFORM_DURATION_REQUIRED')).toMatch(/no recorded duration/i);
  });

  it('provenance is named on the derived asset', () => {
    expect(provenanceLine('transform:restyle:720p', 'asset-1')).toBe('Produced by transform:restyle:720p from asset-1');
  });
});
