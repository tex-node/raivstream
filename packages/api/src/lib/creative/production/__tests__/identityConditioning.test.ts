import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Identity conditioning for the creative pipeline (build 2026-11-02).
 *
 * The read (PR #281) showed creative stills were text-to-image only: no references, no
 * identity block. These tests pin the three pieces that change that, and each asserts
 * the EMITTED CALL or the EMITTED PROMPT — never a flag or a config value.
 */

const submitGenerationJob = vi.fn(async (_input?: Record<string, unknown>) => ({ providerJobId: 'fal:1', outputUrl: 'https://cdn/out.png' }));
vi.mock('../../../generators', () => ({
  submitGenerationJob: (...args: unknown[]) => submitGenerationJob(...(args as [])),
  pollJobStatus: vi.fn(),
  MODEL_META: {},
}));
vi.mock('../../../r2', () => ({ mirrorUrlToR2: async (url: string) => url, uploadBufferToR2: async () => 'r2' }));
vi.mock('../../../lastFrameExtract', () => ({ extractLastFrameAsSeedImage: async () => null }));
vi.mock('../../../promptModeration', () => ({ moderatePrompt: async () => ({ allowed: true }), moderationRejectMessage: () => 'blocked' }));

import { generateStill } from '../generationAdapter';
import {
  composeCreativeIdentityBlock,
  withIdentityBlock,
  resolveCreativeReferences,
  MAX_REFERENCES,
} from '../identityBlock';

beforeEach(() => submitGenerationJob.mockClear());

const baseSpec = { kind: 'IMAGE' as const, sceneId: 'SCENE_01', prompt: 'a lighthouse', aspectRatio: '9:16' };

describe('the endpoint is chosen by the call, not by config', () => {
  it('references present -> FLUX2_EDIT with imageUrls', async () => {
    await generateStill({ ...baseSpec, referenceImageUrls: ['https://cdn/a.png', 'https://cdn/b.png'] }, 'proj', 'asset');
    const call = submitGenerationJob.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(call.model).toBe('FLUX2_EDIT');
    expect(call.imageUrls).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
    expect(call.seedImageUrl).toBeUndefined();
  });

  it('no references, no source photo -> FLUX2 text-to-image', async () => {
    await generateStill({ ...baseSpec }, 'proj', 'asset');
    const call = submitGenerationJob.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(call.model).toBe('FLUX2');
    expect(call.imageUrls).toBeUndefined();
  });

  it('no references but a source photo -> FLUX_KONTEXT (unchanged behaviour)', async () => {
    await generateStill({ ...baseSpec, sourceImageUrl: 'https://cdn/src.png' }, 'proj', 'asset');
    const call = submitGenerationJob.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(call.model).toBe('FLUX_KONTEXT');
    expect(call.seedImageUrl).toBe('https://cdn/src.png');
  });

  it('caps references at the provider limit of 4', async () => {
    await generateStill(
      { ...baseSpec, referenceImageUrls: ['1', '2', '3', '4', '5', '6'].map((n) => `https://cdn/${n}.png`) },
      'proj',
      'asset',
    );
    const call = submitGenerationJob.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect((call.imageUrls as string[]).length).toBe(MAX_REFERENCES);
  });

  it('a reference-less scene still generates — the edit endpoint must not be forced', async () => {
    await expect(generateStill({ ...baseSpec, referenceImageUrls: [] }, 'proj', 'asset')).resolves.toBeTruthy();
    expect((submitGenerationJob.mock.calls[0]![0] as unknown as Record<string, unknown>).model).toBe('FLUX2');
  });
});

describe('the identity block reaches the prompt', () => {
  it('composes prose identity plus positional binding', () => {
    const block = composeCreativeIdentityBlock([
      { name: 'Keeper', visualDescription: 'a weathered man with a grey beard and a yellow oilskin' },
    ]);
    expect(block).toContain('[reference 1: Keeper]');
    expect(block).toContain('yellow oilskin');
  });

  it('a locked block wins over the composed description', () => {
    const block = composeCreativeIdentityBlock([
      { name: 'Keeper', visualDescription: 'ignored', lockedIdentityBlock: 'LOCKED: grey beard, yellow oilskin' },
    ]);
    expect(block).toContain('LOCKED: grey beard, yellow oilskin');
    expect(block).not.toContain('ignored');
  });

  it('no characters -> no block, so a bare scene is not given fake identity text', () => {
    expect(composeCreativeIdentityBlock([])).toBe('');
    expect(withIdentityBlock('a lighthouse', '')).toBe('a lighthouse');
  });

  it('the block is appended to the scene prompt exactly once', () => {
    const block = composeCreativeIdentityBlock([{ name: 'Keeper', visualDescription: 'grey beard' }]);
    const once = withIdentityBlock('a lighthouse at dusk', block);
    expect(once).toContain('CHARACTER IDENTITY');
    expect(withIdentityBlock(once, block)).toBe(once);
  });
});

describe('reference resolution fails open', () => {
  const prismaWith = (rows: Array<{ assetUrl: string | null }>) =>
    ({ characterReferenceAsset: { findMany: async () => rows } }) as never;

  it('returns approved urls, de-duplicated, capped', async () => {
    const urls = await resolveCreativeReferences(prismaWith([
      { assetUrl: 'https://cdn/1.png' },
      { assetUrl: 'https://cdn/1.png' },
      { assetUrl: 'https://cdn/2.png' },
    ]), [{ name: 'Keeper' }]);
    expect(urls).toEqual(['https://cdn/1.png', 'https://cdn/2.png']);
  });

  it('no approved references -> empty list, which routes to text-to-image', async () => {
    expect(await resolveCreativeReferences(prismaWith([]), [{ name: 'Keeper' }])).toEqual([]);
  });

  it('no characters -> no query at all', async () => {
    expect(await resolveCreativeReferences(prismaWith([{ assetUrl: 'x' }]), [])).toEqual([]);
  });
});