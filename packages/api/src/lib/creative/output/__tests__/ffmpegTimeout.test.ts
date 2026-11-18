import { describe, expect, it } from 'vitest';
import { ffmpegWallClockMs } from '../render';

/**
 * The ffmpeg wall-clock policy (2026-11-18).
 *
 * A paid run's assembly was killed at exactly 60 s: a 15.1 s 1080x1920 segment render needed more than the
 * `expectedSeconds * 4` budget with a 60 s floor, while four segments and an end card encoded on the shared VPS.
 * Production had completed and been paid for; only the deliverable was lost. These pin the replacement policy:
 * a floor above the measured segment time, a multiplier with headroom under load, and a cap that still bounds a
 * runaway encode.
 */

describe('the ffmpeg budget is measured, not assumed', () => {
  it('a 15 s segment gets the floor, comfortably above the 60 s that failed', () => {
    expect(ffmpegWallClockMs(15.1)).toBe(3 * 60 * 1000);
  });

  it('an unknown duration (0) gets the floor rather than zero', () => {
    expect(ffmpegWallClockMs(0)).toBe(3 * 60 * 1000);
  });

  it('a 60 s film gets eight times its length', () => {
    expect(ffmpegWallClockMs(60)).toBe(8 * 60 * 1000);
  });

  it('a long film is bounded by the ten-minute cap', () => {
    expect(ffmpegWallClockMs(600)).toBe(10 * 60 * 1000);
    expect(ffmpegWallClockMs(3600)).toBe(10 * 60 * 1000);
  });

  it('never decreases as the expected duration grows', () => {
    const budgets = [0, 5, 15, 30, 60, 120, 600].map(ffmpegWallClockMs);
    for (let i = 1; i < budgets.length; i += 1) expect(budgets[i]).toBeGreaterThanOrEqual(budgets[i - 1]!);
  });
});
