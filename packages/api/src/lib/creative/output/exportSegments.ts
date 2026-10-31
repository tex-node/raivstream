import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getPublicUrlForKey, objectExistsInR2, removeFromR2, uploadBufferToR2 } from '../../r2';

/**
 * Phase 2 segment cache — infrastructure only.
 *
 * Nothing in this module changes output: it describes how a rendered segment is
 * named and where it lives. The read/write path is gated behind a flag in a later
 * commit, and only after a three-way A/B proves a cache hit returns the same
 * bytes a fresh render would.
 */

/**
 * The per-segment filter chain, as one literal.
 *
 * It is in the cache key explicitly because a segment produced by one filter
 * chain must never be assembled into a film built with another: a scale fix or an
 * fps change that left the key untouched would be a cache serving old-filter
 * segments into a new film. **A behaviour-determining input that is not in the key
 * is a cache that lies** — the same class as `identityRefsEnabled` missing from
 * `sourceHash`, and one of the checks in the self-consistency class.
 */
export function exportSegmentFilters(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,settb=AVTB`;
}

/** Master frame size, used when a caller does not pass explicit dimensions. */
export const EXPORT_SEGMENT_FILTERS = exportSegmentFilters(1080, 1920);

export interface ExportSegmentKeyInput {
  /** EXPORT_RENDERER_VERSION at the time of render. */
  rendererVersion: string;
  /** 0-based position in the assembly; a reorder changes the assembled film. */
  segmentIndex: number;
  /** The scene asset this segment was rendered from. */
  sourceAssetId: string;
  /** Output frame size, so a dimension change cannot reuse an old segment. */
  width: number;
  height: number;
  /** Defaults to `exportSegmentFilters(width, height)`. */
  filters?: string;
}

export function buildExportSegmentKey(input: ExportSegmentKeyInput): string {
  const filters = input.filters ?? exportSegmentFilters(input.width, input.height);
  return createHash('sha256')
    .update(
      [
        input.rendererVersion,
        filters,
        `${input.width}x${input.height}`,
        String(input.segmentIndex),
        input.sourceAssetId,
      ].join('|'),
    )
    .digest('hex');
}

/**
 * Project-scoped by design.
 *
 * An asset-scoped key would let two projects share a segment, but it would also
 * serve a segment rendered for project A into project B's assembly. If the two
 * ever diverge in any assembly-affecting way — a per-project flag, a different end
 * card, a future renderer setting — that reuse is silent cross-project
 * contamination. Project scope gives the reuse this phase is about ("change scene
 * 3" inside one project) and refuses the reuse that has no evidence for it yet:
 * the same discipline as leaving `identityRefsEnabled` on one project until the
 * result replicated.
 */
export function exportSegmentObjectKey(projectId: string, segmentKey: string): string {
  return `story-projects/${projectId}/export-segments/${segmentKey}.mp4`;
}

export interface ExportSegmentStore {
  has(key: string): Promise<boolean>;
  download(key: string): Promise<Buffer>;
  upload(key: string, data: Buffer, contentType?: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * R2-backed store, mirroring `MovieRenderSegmentStore` (same interface, different
 * prefix and scope). Returns null when R2 is not configured so dev/test keep the
 * uncached behaviour rather than failing.
 */
export function createR2ExportSegmentStore(
  fetchImpl: typeof fetch = fetch,
): ExportSegmentStore | null {
  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) return null;
  return {
    has: (key) => objectExistsInR2(key, fetchImpl),
    download: async (key) => {
      const url = getPublicUrlForKey(key);
      if (!url) throw new Error(`segment URL unavailable for ${key}`);
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`segment download failed (${response.status}) for ${key}`);
      return Buffer.from(await response.arrayBuffer());
    },
    upload: async (key, data, contentType = 'video/mp4') => {
      const stored = await uploadBufferToR2(data, key, contentType);
      if (!stored) throw new Error(`segment upload failed for ${key}`);
    },
    remove: (key) => removeFromR2(key),
  };
}

/** Convenience for the later read/write path: upload a rendered segment file. */
export async function uploadSegmentFile(
  store: ExportSegmentStore,
  key: string,
  filePath: string,
): Promise<void> {
  await store.upload(key, await readFile(filePath));
}
