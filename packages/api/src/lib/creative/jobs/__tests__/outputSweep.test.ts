import { describe, expect, it } from 'vitest';
import { ASSEMBLY_STALE_MS, OUTPUT_ORPHAN_REASON, sweepableOutputs, type OutputRow } from '../productionWorker';

/**
 * The assembly sweep (2026-11-18).
 *
 * Measured first: **eleven** `CreativeOutput` rows were stuck `GENERATING` in production — the oldest from the first
 * diagnosis, the rest from early November — because a killed worker writes no FAILED row and nothing swept them. The UI
 * reads that status, so those films render forever.
 *
 * The boundary is shared with `assembleProject`'s in-flight guard: past `ASSEMBLY_STALE_MS` a row is stale, not live.
 * One constant, so a row cannot be both blocking and swept.
 */

const NOW = 1_800_000_000_000;

function row(overrides: Partial<OutputRow> & { id: string }): OutputRow {
  return { status: 'GENERATING', createdAt: NOW, ...overrides };
}

describe('a GENERATING row past the render cap is an orphan', () => {
  it('is swept when older than the window', () => {
    const stale = row({ id: 'old', createdAt: NOW - ASSEMBLY_STALE_MS - 1 });
    expect(sweepableOutputs([stale], NOW).map((entry) => entry.id)).toEqual(['old']);
  });

  it('is left alone while it is still plausibly rendering', () => {
    const fresh = row({ id: 'fresh', createdAt: NOW - 60_000 });
    expect(sweepableOutputs([fresh], NOW)).toEqual([]);
  });

  it('exactly at the boundary is not swept: the guard and the sweep agree', () => {
    const boundary = row({ id: 'boundary', createdAt: NOW - ASSEMBLY_STALE_MS });
    expect(sweepableOutputs([boundary], NOW)).toEqual([]);
  });

  it('never touches a READY or FAILED row, however old', () => {
    const ready = row({ id: 'ready', status: 'READY', createdAt: NOW - 10 * ASSEMBLY_STALE_MS });
    const failed = row({ id: 'failed', status: 'FAILED', createdAt: NOW - 10 * ASSEMBLY_STALE_MS });
    expect(sweepableOutputs([ready, failed], NOW)).toEqual([]);
  });

  it('the reason names the worker, not a timeout', () => {
    expect(OUTPUT_ORPHAN_REASON).toMatch(/worker stopped/i);
    expect(OUTPUT_ORPHAN_REASON).toMatch(/re-run/i);
  });
});
