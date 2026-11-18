import { describe, expect, it } from 'vitest';
import { buildResumeIndex, preferAsset, resumeKey, type ResumeAsset } from '../resumeIndex';

/**
 * The resume index (2026-11-18).
 *
 * The defect this pins was observed live: a project with 8 READY IMAGE + 4 READY VIDEO + 3 QUEUED
 * IMAGE produced `generated=0` and `COMPLETED`, and the three QUEUED rows were never reconciled.
 * `byKey` was `new Map(existing.map(...))` — one entry per key, last write wins — so which
 * duplicate survived was decided by `findMany`'s order.
 *
 * The tests are written against the two real directions of that coin:
 *  - a non-READY row winning would regenerate — and re-charge — a scene already produced;
 *  - a READY row winning leaves its non-READY twin QUEUED forever, invisible.
 * Both are decided by the same rule: READY always wins. Recency only breaks ties inside a class.
 */

function asset(overrides: Partial<ResumeAsset> & { id: string }): ResumeAsset {
  return {
    sceneId: 'SCENE_01',
    shotId: null,
    kind: 'IMAGE',
    status: 'QUEUED',
    assetUrl: null,
    createdAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  };
}

describe('READY wins, and nothing about the answer depends on row order', () => {
  const queued = asset({ id: 'queued-old', status: 'QUEUED', createdAt: '2026-11-03T10:00:00.000Z' });
  const ready = asset({ id: 'ready-new', status: 'READY', assetUrl: 'https://r2/ready.png', createdAt: '2026-11-04T10:00:00.000Z' });

  it('the observed case: the older QUEUED orphan is shadowed by the READY row', () => {
    const index = buildResumeIndex([queued, ready]);
    expect(index.byKey.get('SCENE_01:-:IMAGE')?.id).toBe('ready-new');
    expect(index.shadowed.map((row) => row.id)).toEqual(['queued-old']);
  });

  it('the mirror case: a NEWER non-READY row must not win, or the run re-charges for done work', () => {
    const newerQueued = asset({ id: 'queued-new', status: 'QUEUED', createdAt: '2026-11-05T10:00:00.000Z' });
    const index = buildResumeIndex([ready, newerQueued]);
    expect(index.byKey.get('SCENE_01:-:IMAGE')?.id).toBe('ready-new');
    expect(index.shadowed.map((row) => row.id)).toEqual(['queued-new']);
  });

  it('reversing the input changes nothing', () => {
    const forward = buildResumeIndex([queued, ready]);
    const backward = buildResumeIndex([ready, queued]);
    expect(backward.byKey.get('SCENE_01:-:IMAGE')?.id).toBe(forward.byKey.get('SCENE_01:-:IMAGE')?.id);
    expect(backward.shadowed.map((row) => row.id)).toEqual(forward.shadowed.map((row) => row.id));
  });

  it('preferAsset is a total order, so a tie cannot be decided by input position', () => {
    const a = asset({ id: 'a', status: 'READY', createdAt: '2026-11-03T10:00:00.000Z' });
    const b = asset({ id: 'b', status: 'READY', createdAt: '2026-11-03T10:00:00.000Z' });
    expect(preferAsset(a, b).id).toBe(preferAsset(b, a).id);
    expect(preferAsset(a, b).id).toBe('b');
  });
});

describe('what the winner is used for', () => {
  it('the newest READY row supplies the seed asset, not an older READY one', () => {
    const older = asset({ id: 'readier-1', status: 'READY', assetUrl: 'https://r2/old.png', createdAt: '2026-11-01T10:00:00.000Z' });
    const newer = asset({ id: 'readier-2', status: 'READY', assetUrl: 'https://r2/new.png', createdAt: '2026-11-06T10:00:00.000Z' });
    expect(buildResumeIndex([older, newer]).byKey.get('SCENE_01:-:IMAGE')?.assetUrl).toBe('https://r2/new.png');
  });

  it('between two non-READY rows the newest is reused, and neither is reported as shadowed', () => {
    const failed = asset({ id: 'failed', status: 'FAILED', createdAt: '2026-11-02T10:00:00.000Z' });
    const queued = asset({ id: 'queued', status: 'QUEUED', createdAt: '2026-11-07T10:00:00.000Z' });
    const index = buildResumeIndex([failed, queued]);
    expect(index.byKey.get('SCENE_01:-:IMAGE')?.id).toBe('queued');
    expect(index.shadowed).toEqual([]);
  });

  it('a stuck GENERATING row under a READY row is shadowed: it will never run', () => {
    const generating = asset({ id: 'stuck', status: 'GENERATING', createdAt: '2026-11-02T10:00:00.000Z' });
    const index = buildResumeIndex([generating, asset({ id: 'ready', status: 'READY', assetUrl: 'https://r2/x.png' })]);
    expect(index.shadowed.map((row) => row.id)).toEqual(['stuck']);
  });

  it('a failed take under a READY take is NOT an orphan: the take model expects several rows', () => {
    // Each take is its own row. A failed take already ran and is recorded honestly; counting it as
    // shadowed work would make every regenerated scene look broken.
    const failedTake = asset({ id: 'take-1', status: 'FAILED' });
    const readyTake = asset({ id: 'take-2', status: 'READY', assetUrl: 'https://r2/take2.png' });
    const index = buildResumeIndex([failedTake, readyTake]);
    expect(index.byKey.get('SCENE_01:-:IMAGE')?.id).toBe('take-2');
    expect(index.shadowed).toEqual([]);
  });

  it('a shot key never collides with the scene key', () => {
    expect(resumeKey({ sceneId: 'SCENE_01', shotId: 'shot-a', kind: 'IMAGE' })).toBe('SCENE_01:shot-a:IMAGE');
    expect(resumeKey({ sceneId: 'SCENE_01', shotId: null, kind: 'IMAGE' })).toBe('SCENE_01:-:IMAGE');
    expect(resumeKey({ sceneId: 'SCENE_01', kind: 'VIDEO' })).toBe('SCENE_01:-:VIDEO');
  });

  it('a shot READY still does not settle the scene-level key', () => {
    const shot = asset({ id: 'shot', shotId: 'shot-a', status: 'READY', assetUrl: 'https://r2/shot.png' });
    const index = buildResumeIndex([shot]);
    expect(index.byKey.has('SCENE_01:-:IMAGE')).toBe(false);
    expect(index.byKey.get('SCENE_01:shot-a:IMAGE')?.id).toBe('shot');
  });

  it('an empty table is an empty index', () => {
    const index = buildResumeIndex([]);
    expect(index.byKey.size).toBe(0);
    expect(index.shadowed).toEqual([]);
  });
});
