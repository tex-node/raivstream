import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getPublicUrlForKey, listObjectsInR2, objectExistsInR2, removeFromR2, uploadBufferToR2 } from '../../r2';

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

/**
 * Why the prompt is NOT in this key.
 *
 * A segment is a pure function of the **rendered clip** plus the filter chain - it
 * is `scale/crop/setsar/fps` over source bytes, then a video-only x264 encode.
 * `renderOutputDerivative` never receives a prompt: the prompt influenced the
 * *generation* of the clip, and a differently-prompted clip is a different
 * `sourceAssetId`.
 *
 * Adding a prompt hash would therefore not close a gap - it would create misses
 * whenever scene text edits without new pixels, which is exactly the iteration
 * loop the cache exists to accelerate. Two scenes that share one asset but carry
 * different prompts get different keys anyway, because `segmentIndex` differs.
 *
 * The one assumption this makes is that an asset's bytes are immutable once its id
 * exists (R2 keys are per-asset). If an asset is ever overwritten under the same
 * id, that assumption breaks and this key would serve stale pixels.
 */
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

/**
 * Retention policy: 30 days (decided 2026-10-31 — see
 * docs/operations/segment-cache-policy.md).
 *
 * Without a sweep the keyspace grows forever: fifty exports of one project
 * accumulate segments for every asset combination it has ever had, which turns a
 * measured 2x speedup into an R2 bill. A generous TTL bounds growth without
 * tracking per-project usage, and the cost of an expired entry is one cold
 * segment — a performance regression, never a correctness one.
 */
export const EXPORT_SEGMENT_TTL_DAYS = 30;

export const EXPORT_SEGMENT_PREFIX = 'export-segments/';

export interface SweepableSegmentObject {
  key: string;
  lastModified: Date | null;
}

/**
 * Which objects the TTL sweep should delete. Pure, so the policy is testable
 * without R2. An object with no `lastModified` is KEPT: unknown age is not
 * evidence of staleness, and deleting on unknown would be the fail-open version.
 */
export function selectExpiredSegmentKeys(
  objects: SweepableSegmentObject[],
  options: { now: Date; ttlDays?: number; prefix?: string },
): string[] {
  const ttlDays = options.ttlDays ?? EXPORT_SEGMENT_TTL_DAYS;
  const prefix = options.prefix ?? EXPORT_SEGMENT_PREFIX;
  const cutoff = options.now.getTime() - ttlDays * 24 * 60 * 60 * 1000;
  return objects
    .filter((object) => object.key.includes(prefix))
    .filter((object) => object.lastModified !== null && object.lastModified.getTime() < cutoff)
    .map((object) => object.key);
}

/**
 * Execute the TTL policy. Lists, filters, deletes, and reports counts.
 *
 * Listing is done over `story-projects/` and filtered, because R2 has no wildcard
 * prefix: `export-segments` sits inside each project. That scans the whole
 * story-projects keyspace, which is acceptable at current volume and is the reason
 * the sweep runs once per worker boot rather than per export.
 *
 * Injected list/remove keep it testable and keep the R2 dependency out of the
 * policy predicate.
 */
export async function sweepExpiredExportSegments(options?: {
  now?: Date;
  ttlDays?: number;
  list?: (prefix: string) => Promise<SweepableSegmentObject[]>;
  remove?: (key: string) => Promise<void>;
}): Promise<{ scanned: number; deleted: number }> {
  const list = options?.list ?? listObjectsInR2;
  const remove = options?.remove ?? removeFromR2;
  const objects = await list('story-projects/');
  const scanned = objects.filter((object) => object.key.includes(EXPORT_SEGMENT_PREFIX)).length;
  const keys = selectExpiredSegmentKeys(objects, {
    now: options?.now ?? new Date(),
    ttlDays: options?.ttlDays,
  });
  for (const key of keys) await remove(key);
  return { scanned, deleted: keys.length };
}
