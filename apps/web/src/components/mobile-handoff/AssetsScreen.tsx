'use client';

import { useState } from 'react';
import { Heart, Copy } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { Skeleton, EmptyState } from '@/components/mobile/primitives';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { useTrackTab } from './useTrackTab';

/**
 * Assets — design_handoff_raivstream_mobile, screen 8 of 8. Canonical:
 * /story-playground/[projectId]/assets.
 *
 * The design mocks 4 filter chips (All/Chosen/Scenes/Characters). This
 * backend only has one asset category today (per-scene generated images —
 * no separate character-portrait asset type), so "Scenes"/"Characters"
 * would always be identical to "All"/empty; shipping them would be a filter
 * that lies about what it does. Real, backed filters only: All, Favorites
 * (StorySceneAsset.isFavorite).
 *
 * Reuse: every ready asset can be copied into another scene of the same
 * story (cheap — the R2 object is shared) or into a different story
 * (the object is re-mirrored into the target project's R2 namespace).
 * Picking "Create a new scene" appends a scene to the target story.
 */

type Filter = 'all' | 'favorites';

export function AssetsScreen({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter>('all');
  const [reuseAsset, setReuseAsset] = useState<any | null>(null);
  const [targetProjectId, setTargetProjectId] = useState(projectId);
  const [targetSceneId, setTargetSceneId] = useState('');
  useTrackTab(projectId, 'assets');

  const workspaceQuery = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );
  const projectsQuery = trpc.story.listMyProjects.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
  });
  const favoriteMutation = trpc.story.favoriteSceneAsset.useMutation({
    onSuccess: () => utils.story.getWorkspace.invalidate({ projectId }),
  });
  const reuseMutation = trpc.story.reuseSceneAsset.useMutation({
    onSuccess: () => {
      utils.story.getWorkspace.invalidate({ projectId });
      utils.story.listMyProjects.invalidate();
      setReuseAsset(null);
    },
  });

  const scenes: any[] = (workspaceQuery.data as any)?.project?.sceneSeeds ?? [];
  const allAssets = scenes.flatMap((scene) =>
    (scene.assets ?? [])
      .filter((a: any) => a.status === 'READY')
      .map((a: any) => ({ ...a, sceneIndex: scene.orderIndex, sceneId: scene.id, isActive: a.id === scene.activeImageAssetId })),
  );
  const visibleAssets = filter === 'favorites' ? allAssets.filter((a) => a.isFavorite) : allAssets;
  const favoriteCount = allAssets.filter((a) => a.isFavorite).length;

  const projects: any[] = (projectsQuery.data ?? []) as any[];
  const targetProject = projects.find((p: any) => p.id === targetProjectId);
  const targetProjectScenes = ((targetProject?.sceneSeeds ?? []) as any[])
    .filter((s: any) => !(reuseAsset && targetProjectId === projectId && s.id === reuseAsset.sceneId))
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  const openReuse = (asset: any) => {
    setReuseAsset(asset);
    setTargetProjectId(projectId);
    setTargetSceneId('');
  };

  return (
    <Shell backHref={`/story-playground/${projectId}`} title="Assets" activeTab="assets" projectId={projectId}>
      <div className="px-[18px] pt-3.5 pb-8 lg:px-10 lg:py-10 lg:max-w-[1440px] lg:mx-auto">
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }} className="hide-scrollbar">
          {(['all', 'favorites'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`noc-seg${filter === f ? ' active' : ''}`}
              style={{ borderRadius: 999, padding: '9px 14px' }}
            >
              {f === 'all' ? `All ${allAssets.length}` : `Favorites ${favoriteCount}`}
            </button>
          ))}
        </div>

        {workspaceQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4 wide:grid-cols-6 lg:gap-4">
            <Skeleton height={140} radius={14} />
            <Skeleton height={140} radius={14} />
          </div>
        ) : visibleAssets.length === 0 ? (
          <EmptyState title={filter === 'favorites' ? 'No favorites yet' : 'No assets yet'} hint="Generate scene images to see them here." />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4 wide:grid-cols-6 lg:gap-4">
            {visibleAssets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: `1px solid ${asset.selectedForStorybookAt ? 'rgba(178,90,217,0.4)' : 'rgba(233,233,237,0.07)'}`,
                  background: 'rgba(233,233,237,0.03)',
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '4 / 3', background: `url(${asset.thumbnailUrl ?? asset.assetUrl}) center/cover` }}>
                  {asset.selectedForStorybookAt && (
                    <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(217,70,168,0.85)', color: '#0A0B12', fontSize: 9.5, fontWeight: 600, borderRadius: 5, padding: '3px 6px' }}>
                      STORYBOOK
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => favoriteMutation.mutate({ projectId, assetId: asset.id, isFavorite: !asset.isFavorite })}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
                    aria-label={asset.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart size={16} fill={asset.isFavorite ? '#d946a8' : 'none'} color={asset.isFavorite ? '#d946a8' : 'rgba(247,248,252,0.45)'} strokeWidth={1.8} />
                  </button>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--noc-t1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Scene {String(asset.sceneIndex + 1).padStart(2, '0')} · take
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--noc-t6)', margin: '2px 0 0' }}>
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.assetType}
                  </p>
                  {(asset.isActive || asset.isLatest || asset.approvedAt) && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {asset.isActive && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, borderRadius: 5, padding: '2px 5px', background: 'rgba(79,139,214,0.14)', color: 'var(--noc-blue)' }}>ACTIVE</span>
                      )}
                      {asset.isLatest && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, borderRadius: 5, padding: '2px 5px', background: 'rgba(233,233,237,0.08)', color: 'var(--noc-t4)' }}>LATEST</span>
                      )}
                      {asset.approvedAt && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, borderRadius: 5, padding: '2px 5px', background: 'rgba(79,139,214,0.14)', color: 'var(--noc-blue)' }}>APPROVED</span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openReuse(asset)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                      fontSize: 11, fontWeight: 700, color: 'var(--noc-purple)',
                      background: 'rgba(178,90,217,0.10)', border: 'none', borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
                    }}
                  >
                    <Copy size={12} strokeWidth={2} /> Reuse
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reuseAsset && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,6,12,0.6)', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 440, borderRadius: 16, background: 'var(--noc-card)', border: '1px solid rgba(233,233,237,0.12)', padding: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--noc-t1)', margin: 0 }}>Reuse asset</p>
            <p style={{ fontSize: 12, color: 'var(--noc-t4)', margin: '4px 0 14px' }}>
              Scene {String(reuseAsset.sceneIndex + 1).padStart(2, '0')} · {reuseAsset.assetType} — copy it into this story or another story.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--noc-t4)', marginBottom: 12 }}>
              Target story
              <select
                value={targetProjectId}
                onChange={(e) => { setTargetProjectId(e.target.value); setTargetSceneId(''); }}
                style={{ width: '100%', marginTop: 5, borderRadius: 10, border: '1px solid rgba(233,233,237,0.12)', background: 'rgba(233,233,237,0.05)', padding: '9px 10px', fontSize: 13, fontWeight: 600, color: 'var(--noc-t1)' }}
              >
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title ?? 'Untitled story'}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--noc-t4)', marginBottom: 16 }}>
              Target scene
              <select
                value={targetSceneId}
                onChange={(e) => setTargetSceneId(e.target.value)}
                style={{ width: '100%', marginTop: 5, borderRadius: 10, border: '1px solid rgba(233,233,237,0.12)', background: 'rgba(233,233,237,0.05)', padding: '9px 10px', fontSize: 13, fontWeight: 600, color: 'var(--noc-t1)' }}
              >
                <option value="">+ Create a new scene</option>
                {targetProjectScenes.map((s: any) => (
                  <option key={s.id} value={s.id}>Scene {String(s.orderIndex + 1).padStart(2, '0')} · {s.title || 'Untitled'}</option>
                ))}
              </select>
            </label>
            {reuseMutation.error && (
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--noc-magenta)', margin: '0 0 12px' }}>{reuseMutation.error.message}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setReuseAsset(null)}
                style={{ borderRadius: 10, border: '1px solid rgba(233,233,237,0.12)', background: 'transparent', padding: '9px 14px', fontSize: 13, fontWeight: 700, color: 'var(--noc-t1)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reuseMutation.isPending}
                onClick={() => reuseMutation.mutate({ assetId: reuseAsset.id, targetProjectId, targetSceneId: targetSceneId || undefined })}
                style={{ borderRadius: 10, border: 'none', background: 'var(--noc-purple)', padding: '9px 14px', fontSize: 13, fontWeight: 800, color: '#0A0B12', cursor: 'pointer', opacity: reuseMutation.isPending ? 0.6 : 1 }}
              >
                {reuseMutation.isPending ? 'Copying…' : 'Copy asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}