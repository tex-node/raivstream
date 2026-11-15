import { describe, expect, it } from 'vitest';
import { createRelightRenderer } from '../relightRenderer';
import { deriveTransformTake } from '../derivedAsset';

/**
 * The lifecycle fix (2026-11-15).
 *
 * The relight proof charged 1,578 credits and stored `fal:relight:<requestId>` as the asset URL, marking the
 * row READY with no media. These tests pin the class directly: a queue reference can never become an asset.
 */
describe('a transformation completes its lifecycle', () => {
  const source = { sourceAssetUrl: 'https://cdn/src.mp4', operation: 'relight' as const, resolution: '720p', outputSeconds: 3 };

  it('refuses to treat a queue reference as a rendered asset', async () => {
    // The guard in deriveTransformTake: `fal:` is a job handle, not a result.
    const calls: string[] = [];
    const fake = {
      creativeProducedAsset: {
        findUnique: async () => ({ id: 'src', projectId: 'p', sceneId: 's', shotId: null, kind: 'VIDEO', assetUrl: 'https://cdn/src.mp4', durationSeconds: 3 }),
        findFirst: async () => null,
        create: async () => ({ id: 'new' }),
        update: async (args: { data: Record<string, unknown> }) => { calls.push(String(args.data.status)); return {}; },
        updateMany: async () => ({ count: 0 }),
      },
      creativeProject: { findUnique: async () => ({ userId: 'u' }) },
      featureCreditRate: { findUnique: async () => ({ creditsPerUnit: 263, isActive: true }) },
      creditTransaction: { findUnique: async () => null, create: async () => ({}) },
      creditBalance: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ balance: 99999 }) },
      $transaction: async (ops: unknown) => ops,
    } as never;

    await expect(deriveTransformTake(fake, { render: async () => 'fal:relight:01a1e09e' }, {
      projectId: 'p', sourceAssetId: 'src', operation: 'relight', resolution: '720p', outputSeconds: 3,
    })).rejects.toThrow(/TRANSFORM_RENDER_INCOMPLETE/);
    // And the row is marked FAILED rather than being left READY.
    expect(calls).toContain('FAILED');
  });

  it('the renderer fails closed when no endpoint is configured', async () => {
    const render = createRelightRenderer({});
    await expect(render(source)).rejects.toThrow(/TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED/);
  });
});
