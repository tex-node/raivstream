import { describe, it, expect } from 'vitest';
import {
  EXPORT_SEGMENT_TTL_DAYS,
  selectExpiredSegmentKeys,
} from '../exportSegments';

const now = new Date('2026-10-31T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

function object(key: string, lastModified: Date | null) {
  return { key: `story-projects/p1/export-segments/${key}.mp4`, lastModified };
}

describe('export segment retention (TTL)', () => {
  it('defaults to 30 days', () => {
    expect(EXPORT_SEGMENT_TTL_DAYS).toBe(30);
  });

  it('selects only objects older than the TTL', () => {
    const keys = selectExpiredSegmentKeys(
      [object('old', daysAgo(31)), object('fresh', daysAgo(2)), object('edge', daysAgo(29))],
      { now },
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('old');
  });

  it('keeps objects whose age is unknown (fail-closed, never delete on unknown)', () => {
    expect(selectExpiredSegmentKeys([object('unknown', null)], { now })).toHaveLength(0);
  });

  it('ignores objects outside the export-segments prefix', () => {
    const keys = selectExpiredSegmentKeys(
      [{ key: 'story-projects/p1/scenes/s1/assets/a1.png', lastModified: daysAgo(90) }],
      { now },
    );
    expect(keys).toHaveLength(0);
  });

  it('a custom TTL is honoured', () => {
    const keys = selectExpiredSegmentKeys([object('week-old', daysAgo(8))], { now, ttlDays: 7 });
    expect(keys).toHaveLength(1);
  });

  it('an empty listing yields nothing (no crash on a cold keyspace)', () => {
    expect(selectExpiredSegmentKeys([], { now })).toEqual([]);
  });
});
