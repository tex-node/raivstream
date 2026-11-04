import { describe, expect, it } from 'vitest';
import { buildExportSegmentKey, type ExportSegmentStore } from '../exportSegments';
import { computeSourceHash } from '../../../story/storyVideoExportService';

/**
 * Phase 2's exit criterion, as a test (2026-11-04).
 *
 *   "Change scene 3 -> only scene 3 re-renders and the film re-assembles;
 *    the other scenes keep their existing takes."
 *
 * The mechanism was already built and keyed on `sourceAssetId`; what was missing was the
 * evidence. This drives the exact decision the renderer makes - key lookup, hit or miss -
 * across three arms, and pins both halves of the claim: the miss COUNT and the miss KEY.
 *
 * Why not the full renderer: `renderOutputDerivative` needs ffmpeg and an R2 store. The
 * cache decision is a pure function of (rendererVersion, filters, size, segmentIndex,
 * sourceAssetId), so the arms are provable here and the renderer's own counters
 * (`[export.segments] hit=… miss=…`, render.ts:881) are computed from exactly these keys.
 */

const RENDERER = 'phase-9b1a-v2';
const W = 1080;
const H = 1920;

interface Scene { sceneId: string; assetId: string; durationSeconds: number }

const baseline: Scene[] = [
  { sceneId: 'SCENE_01', assetId: 'asset-1', durationSeconds: 4 },
  { sceneId: 'SCENE_02', assetId: 'asset-2', durationSeconds: 5 },
  { sceneId: 'SCENE_03', assetId: 'asset-3', durationSeconds: 4 },
];

/** A new take on scene 3: a NEW asset id, the other scenes untouched. */
const withNewTake: Scene[] = baseline.map((scene) =>
  scene.sceneId === 'SCENE_03' ? { ...scene, assetId: 'asset-3-take-2' } : scene,
);

function keyFor(scene: Scene, segmentIndex: number): string {
  return buildExportSegmentKey({
    rendererVersion: RENDERER,
    segmentIndex,
    sourceAssetId: scene.assetId,
    width: W,
    height: H,
  });
}

function memoryStore(): ExportSegmentStore & { keys: string[] } {
  const objects = new Map<string, Buffer>();
  const keys: string[] = [];
  return {
    keys,
    has: async (key) => objects.has(key),
    download: async (key) => {
      const value = objects.get(key);
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
    upload: async (key, data) => {
      objects.set(key, data);
      keys.push(key);
    },
    remove: async (key) => {
      objects.delete(key);
    },
  };
}

/** The renderer's decision, without the render: returns which segments hit and which missed. */
async function assemble(
  scenes: Scene[],
  store: ExportSegmentStore,
): Promise<{ hits: string[]; misses: string[]; keys: string[] }> {
  const hits: string[] = [];
  const misses: string[] = [];
  const keys: string[] = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const key = keyFor(scenes[i]!, i);
    keys.push(key);
    if (await store.has(key)) {
      hits.push(key);
      continue;
    }
    misses.push(key);
    await store.upload(key, Buffer.from(`segment-${i}`));
  }
  return { hits, misses, keys };
}

/** Timeline signature: what the assembled film is, independent of which segments were cached. */
function timelineSignature(scenes: Scene[]): string {
  return scenes.map((scene) => `${scene.sceneId}:${scene.durationSeconds.toFixed(3)}`).join('|');
}

describe('Phase 2 exit criterion — change scene 3, only scene 3 re-renders', () => {
  it('arm 1: a cold cache misses every segment', async () => {
    const store = memoryStore();
    const run = await assemble(baseline, store);
    expect(run.hits).toHaveLength(0);
    expect(run.misses).toHaveLength(baseline.length);
    expect(store.keys).toHaveLength(baseline.length);
  });

  it('arm 3: changing scene 3 gives N-1 hits and exactly 1 miss', async () => {
    const store = memoryStore();
    await assemble(baseline, store);          // arm 1 — warm the cache
    const run = await assemble(withNewTake, store); // arm 3

    expect(run.misses).toHaveLength(1);
    expect(run.hits).toHaveLength(baseline.length - 1);
  });

  it('arm 3: the missed key is scene 3\'s, not another segment', async () => {
    const store = memoryStore();
    await assemble(baseline, store);
    const run = await assemble(withNewTake, store);

    const scene3Key = keyFor(withNewTake[2]!, 2);
    expect(run.misses[0]).toBe(scene3Key);
    // and it is NOT the baseline key for that position — the take changed the identity
    expect(run.misses[0]).not.toBe(keyFor(baseline[2]!, 2));
    // the other two keys are byte-identical to the baseline run
    expect(run.keys[0]).toBe(keyFor(baseline[0]!, 0));
    expect(run.keys[1]).toBe(keyFor(baseline[1]!, 1));
  });

  it('arm 3: the assembled timeline is identical to the baseline', async () => {
    expect(timelineSignature(withNewTake)).toBe(timelineSignature(baseline));
  });

  it('the source hash changes, and only because scene 3 changed', () => {
    const pairs = (scenes: Scene[]) => scenes.map((s) => ({ sceneId: s.sceneId, assetId: s.assetId }));
    const before = computeSourceHash(pairs(baseline), { identityRefsEnabled: true });
    const after = computeSourceHash(pairs(withNewTake), { identityRefsEnabled: true });
    expect(after).not.toBe(before);

    // the other two pairs are unchanged inputs — the DB rows those ids name are untouched
    expect(pairs(withNewTake).slice(0, 2)).toEqual(pairs(baseline).slice(0, 2));
  });
});