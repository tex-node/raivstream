import { describe, expect, it } from 'vitest';
import { assertAudioAssetOwnership, resolveProjectAudioAssets } from '../story';

/**
 * Symmetrical ownership enforcement at the write-time API boundary
 * (addCue/updateCue both call assertAudioAssetOwnership before writing an
 * audioAssetId onto a cue) and at the blueprint-build-time boundary
 * (resolveProjectAudioAssets is what every buildAudioBlueprint call site in
 * story.ts passes in as `resolvedAudioAssets`). The third leg of the same
 * rule — the render worker's OWN independent re-check, proving a tampered
 * persisted cue is refused even if it bypassed both boundaries above — is
 * movieRenderWorkerAudio.test.ts's "refuses to render a tampered cue..." test.
 */
function prismaMock(assets: Array<{ id: string; projectId: string; storageKey: string }>) {
  return {
    audioAsset: {
      findFirst: async ({ where }: any) => assets.find((a) => a.id === where.id && a.projectId === where.projectId) ?? null,
      findMany: async ({ where }: any) => assets.filter((a) => where.id.in.includes(a.id) && a.projectId === where.projectId),
    },
  } as any;
}

describe('assertAudioAssetOwnership', () => {
  // Test 1 of 3 — Project A cue + Project A audio asset -> allowed.
  it('allows an asset that belongs to the same project', async () => {
    const ctx = { prisma: prismaMock([{ id: 'asset-1', projectId: 'project-a', storageKey: 'k1' }]) };
    await expect(assertAudioAssetOwnership(ctx, 'project-a', 'asset-1')).resolves.toMatchObject({ id: 'asset-1' });
  });

  // Test 2 of 3 — Project A cue + Project B audio asset -> denied.
  it('denies an asset that belongs to a different project', async () => {
    const ctx = { prisma: prismaMock([{ id: 'asset-1', projectId: 'project-b', storageKey: 'k1' }]) };
    await expect(assertAudioAssetOwnership(ctx, 'project-a', 'asset-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('denies an asset id that does not exist at all', async () => {
    const ctx = { prisma: prismaMock([]) };
    await expect(assertAudioAssetOwnership(ctx, 'project-a', 'nonexistent')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('resolveProjectAudioAssets (the blueprint-builder\'s own defensive layer)', () => {
  it('resolves only the assets that belong to the given project, silently omitting cross-project ids from the map', async () => {
    const ctx = {
      prisma: prismaMock([
        { id: 'own-asset', projectId: 'project-a', storageKey: 'k-own' },
        { id: 'foreign-asset', projectId: 'project-b', storageKey: 'k-foreign' },
      ]),
    };
    const tracks = [{ cues: [{ audioAssetId: 'own-asset' }, { audioAssetId: 'foreign-asset' }, { audioAssetId: null }] }];
    const resolved = await resolveProjectAudioAssets(ctx, 'project-a', tracks);
    expect(resolved.has('own-asset')).toBe(true);
    expect(resolved.get('own-asset')).toEqual({ storageKey: 'k-own' });
    // The cross-project id is a real id (findMany would happily return it
    // for the WRONG project), but it must never appear in a map scoped to
    // project-a — this is what makes buildAudioBlueprint's defensive skip
    // actually defensive rather than just trusting whatever the caller hands it.
    expect(resolved.has('foreign-asset')).toBe(false);
    expect(resolved.size).toBe(1);
  });

  it('returns an empty map without querying when no cue has an audioAssetId', async () => {
    let queried = false;
    const ctx = { prisma: { audioAsset: { findMany: async () => { queried = true; return []; } } } };
    const resolved = await resolveProjectAudioAssets(ctx as any, 'project-a', [{ cues: [{ audioAssetId: null }] }]);
    expect(resolved.size).toBe(0);
    expect(queried).toBe(false);
  });
});
