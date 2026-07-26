export type StorybookCandidateAsset = {
  id: string;
  status: string;
  assetUrl?: string | null;
  isLatest?: boolean | null;
  creativeStatus?: string | null;
  moderationStatus?: string | null;
  deletedAt?: Date | string | null;
};

export type StorybookCandidateScene = {
  activeImageAssetId?: string | null;
  imageUrl?: string | null;
  assets?: StorybookCandidateAsset[];
};

function ready(asset: StorybookCandidateAsset) {
  return asset.status === 'READY'
    && !asset.deletedAt
    && asset.moderationStatus !== 'REJECTED'
    && asset.creativeStatus !== 'REJECTED';
}

export function selectStorybookImageForScene(scene: StorybookCandidateScene) {
  const readyAssets = (scene.assets ?? []).filter(ready);
  const activeAsset = readyAssets.find((asset) => asset.id === scene.activeImageAssetId) ?? null;
  const activeApprovedAsset = activeAsset?.creativeStatus === 'APPROVED' ? activeAsset : null;
  const latestApprovedAsset = readyAssets.find((asset) => asset.creativeStatus === 'APPROVED') ?? null;
  const latestAsset = readyAssets.find((asset) => asset.isLatest) ?? readyAssets[0] ?? null;
  const selectedAsset = activeApprovedAsset ?? activeAsset ?? latestApprovedAsset ?? latestAsset;
  return {
    asset: selectedAsset,
    imageUrl: selectedAsset?.assetUrl ?? scene.imageUrl ?? null,
    imageSource: activeApprovedAsset
      ? 'ACTIVE_APPROVED'
      : activeAsset
        ? 'ACTIVE'
        : latestApprovedAsset
          ? 'LATEST_APPROVED'
          : latestAsset
            ? 'LATEST'
            : scene.imageUrl
              ? 'SCENE'
              : 'PLACEHOLDER',
  };
}
