import { describe, it, expect } from 'vitest';
import { timeoutForDuration } from '../falWhisper';

/**
 * The Whisper budget has to grow with the clip: a flat 10 s silently failed open
 * on long audio, which meant audio moderation was skipped without anyone seeing
 * a rejection.
 */
describe('whisper timeout budget', () => {
  it('gives a 60 second clip at least 45 seconds', () => {
    expect(timeoutForDuration(60)).toBeGreaterThanOrEqual(45_000);
  });

  it('scales monotonically with duration', () => {
    expect(timeoutForDuration(90)).toBeGreaterThan(timeoutForDuration(60));
    expect(timeoutForDuration(30)).toBeLessThanOrEqual(timeoutForDuration(60));
  });

  it('never drops below the 30 s floor, even for a 1 s clip', () => {
    expect(timeoutForDuration(1)).toBe(30_000);
  });

  it('falls back to the 45 s default when duration is unknown', () => {
    expect(timeoutForDuration(undefined)).toBe(45_000);
    expect(timeoutForDuration(null)).toBe(45_000);
    expect(timeoutForDuration(Number.NaN)).toBe(45_000);
    expect(timeoutForDuration(0)).toBe(45_000);
  });
});
