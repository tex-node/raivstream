import { describe, expect, it } from 'vitest';
import { batchRunIsActive, canStartBatch, defaultResumeCap, describeBatchPanel, summarizeBatch } from '../batchGenerationUi';

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

describe('describeBatchPanel', () => {
  const full = { total: 6, ready: 6, failed: 0, done: 6 };
  const partial = { total: 6, ready: 4, failed: 2, done: 6 };
  const early = { total: 6, ready: 2, failed: 0, done: 2 };

  it('renders at COMPLETED with the summary count and no cancel/resume', () => {
    const p = describeBatchPanel('COMPLETED', full);
    expect(p.show).toBe(true);
    expect(p.headline).toBe('Made 6 of 6 — view them.');
    expect(p.showItems).toBe(true);
    expect(p.showCancel).toBe(false);
    expect(p.showResume).toBe(false);
    expect(p.showRetry).toBe(false);
    expect(p.showStartAnother).toBe(true);
  });

  it('renders at FAILED with the retry affordance', () => {
    const p = describeBatchPanel('FAILED', partial);
    expect(p.show).toBe(true);
    expect(p.headline).toBe("6 of 6 done. Some pictures didn't work.");
    expect(p.showRetry).toBe(true);
    expect(p.showCancel).toBe(false);
    expect(p.showStartAnother).toBe(true);
  });

  it('renders at CANCELLED and offers retry when items failed', () => {
    const p = describeBatchPanel('CANCELLED', partial);
    expect(p.show).toBe(true);
    expect(p.headline).toBe('Stopped — 6 of 6 done.');
    expect(p.showRetry).toBe(true);
  });

  it('keeps RUNNING / PAUSED behavior (cancel; resume only when paused)', () => {
    const running = describeBatchPanel('RUNNING', early);
    expect(running.show).toBe(true);
    expect(running.showCancel).toBe(true);
    expect(running.showResume).toBe(false);
    expect(running.showRetry).toBe(false);
    expect(running.showStartAnother).toBe(false);

    const paused = describeBatchPanel('PAUSED', early);
    expect(paused.show).toBe(true);
    expect(paused.showResume).toBe(true);
    expect(paused.headline).toBe('Paused — 2 of 6 done.');
  });

  it('keeps the per-item list visible at COMPLETED', () => {
    expect(describeBatchPanel('COMPLETED', full).showItems).toBe(true);
  });
});
