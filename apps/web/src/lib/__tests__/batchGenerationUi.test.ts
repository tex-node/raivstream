import { describe, expect, it } from 'vitest';
import { batchRunIsActive, canStartBatch, defaultResumeCap, summarizeBatch } from '../batchGenerationUi';

describe('canStartBatch', () => {
  it('disables Start when the estimate exceeds the cap', () => {
    expect(canStartBatch(500, 400)).toBe(false);
  });
  it('allows Start when the estimate fits', () => {
    expect(canStartBatch(400, 400)).toBe(true);
    expect(canStartBatch(300, 400)).toBe(true);
  });
  it('rejects a non-positive / NaN cap', () => {
    expect(canStartBatch(100, 0)).toBe(false);
    expect(canStartBatch(100, Number.NaN)).toBe(false);
  });
});

describe('defaultResumeCap', () => {
  it('is at least costUsed + one item estimate so progress is possible', () => {
    expect(defaultResumeCap(8000, 80)).toBe(8080);
    expect(defaultResumeCap(8000, 80)).toBeGreaterThanOrEqual(8000 + 80);
  });
  it('still advances when the item cost is unknown', () => {
    expect(defaultResumeCap(8000, 0)).toBe(8001);
  });
});

describe('summarizeBatch', () => {
  it('counts done/ready/failed and treats failed as done', () => {
    const s = summarizeBatch([{ status: 'READY' }, { status: 'FAILED' }, { status: 'RUNNING' }, { status: 'QUEUED' }]);
    expect(s).toMatchObject({ total: 4, ready: 1, failed: 1, done: 2, running: 1, queued: 1 });
  });
});

describe('batchRunIsActive', () => {
  it('shows the panel only while the run is in flight', () => {
    expect(batchRunIsActive('RUNNING')).toBe(true);
    expect(batchRunIsActive('PAUSED')).toBe(true);
    expect(batchRunIsActive('COMPLETED')).toBe(false);
    expect(batchRunIsActive('CANCELLED')).toBe(false);
  });
});
