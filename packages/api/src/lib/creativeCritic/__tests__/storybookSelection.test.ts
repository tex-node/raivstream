import { describe, expect, it } from 'vitest';
import { selectStorybookImageForScene } from '../storybookSelection';

describe('creative storybook image selection', () => {
  it('prefers active creatively approved image', () => {
    const selected = selectStorybookImageForScene({
      activeImageAssetId: 'old',
      imageUrl: 'legacy',
      assets: [
        { id: 'latest', status: 'READY', assetUrl: 'latest-url', isLatest: true, creativeStatus: 'DRAFT' },
        { id: 'old', status: 'READY', assetUrl: 'old-url', creativeStatus: 'APPROVED' },
      ],
    });
    expect(selected.imageSource).toBe('ACTIVE_APPROVED');
    expect(selected.imageUrl).toBe('old-url');
  });

  it('falls back to active ready image before latest approved image', () => {
    const selected = selectStorybookImageForScene({
      activeImageAssetId: 'active',
      assets: [
        { id: 'approved', status: 'READY', assetUrl: 'approved-url', creativeStatus: 'APPROVED' },
        { id: 'active', status: 'READY', assetUrl: 'active-url', creativeStatus: 'DRAFT' },
      ],
    });
    expect(selected.imageSource).toBe('ACTIVE');
    expect(selected.imageUrl).toBe('active-url');
  });

  it('uses latest approved, latest ready, legacy image, then placeholder', () => {
    expect(selectStorybookImageForScene({
      assets: [
        { id: 'draft-latest', status: 'READY', assetUrl: 'draft-url', isLatest: true },
        { id: 'approved', status: 'READY', assetUrl: 'approved-url', creativeStatus: 'APPROVED' },
      ],
    }).imageSource).toBe('LATEST_APPROVED');

    expect(selectStorybookImageForScene({
      assets: [{ id: 'latest', status: 'READY', assetUrl: 'latest-url', isLatest: true }],
    }).imageSource).toBe('LATEST');

    expect(selectStorybookImageForScene({ imageUrl: 'legacy-url', assets: [] }).imageSource).toBe('SCENE');
    expect(selectStorybookImageForScene({ assets: [] }).imageSource).toBe('PLACEHOLDER');
  });

  it('keeps pre-critic assets usable and excludes rejected assets', () => {
    const legacy = selectStorybookImageForScene({
      assets: [{ id: 'pre8b', status: 'READY', assetUrl: 'pre8b-url', isLatest: true }],
    });
    expect(legacy.imageUrl).toBe('pre8b-url');

    const rejected = selectStorybookImageForScene({
      imageUrl: 'legacy-url',
      assets: [{ id: 'unsafe', status: 'READY', assetUrl: 'unsafe-url', isLatest: true, creativeStatus: 'APPROVED', moderationStatus: 'REJECTED' }],
    });
    expect(rejected.imageSource).toBe('SCENE');
    expect(rejected.imageUrl).toBe('legacy-url');

    const creativeRejected = selectStorybookImageForScene({
      activeImageAssetId: 'rejected',
      assets: [
        { id: 'approved', status: 'READY', assetUrl: 'approved-url', creativeStatus: 'APPROVED' },
        { id: 'rejected', status: 'READY', assetUrl: 'rejected-url', creativeStatus: 'REJECTED' },
      ],
    });
    expect(creativeRejected.imageSource).toBe('LATEST_APPROVED');
    expect(creativeRejected.imageUrl).toBe('approved-url');
  });
});
