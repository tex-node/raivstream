/**
 * The resume index (2026-11-18).
 *
 * The runner decides what to skip by building one map entry per
 * `sceneId:shotId:kind`. That map used to be `new Map(existing.map(...))` — **last
 * write wins** — so which row survived a duplicate depended on the order
 * `findMany` happened to return. Two opposite defects came from the same line:
 *
 *  - a **non-READY** row won: the scene looked unfinished, the runner reused that
 *    row and charged for work already done (a duplicate spend, not a retry);
 *  - a **READY** row won: the scene was correctly skipped and its non-READY twin
 *    stayed QUEUED forever — invisible to the runner and to a UI that reads the
 *    READY row, which is why "12 READY assets" and `generated=0` disagreed.
 *
 * The rule is not "newest wins" or "first wins". The resume contract is *a scene
 * with a READY asset of that kind is finished*, so **READY always wins**; recency
 * only breaks ties inside the same class. Rows still waiting or in flight under a
 * key a READY row settles (`QUEUED`, `GENERATING`) are returned as `shadowed`, so
 * an orphan is a number a session can quote rather than an inference from two
 * screenshots. A `FAILED` take is terminal and honest, and is not counted — the
 * take model means one key legitimately owns several rows.
 */

export interface ResumeAsset {
  id: string;
  sceneId: string;
  shotId?: string | null;
  kind: string;
  status: string;
  assetUrl?: string | null;
  createdAt?: Date | string | null;
}

/** The one key both the plan's specs and the produced assets are addressed by. */
export function resumeKey(asset: { sceneId: string; shotId?: string | null; kind: string }): string {
  return `${asset.sceneId}:${asset.shotId ?? '-'}:${asset.kind}`;
}

function readinessRank(asset: ResumeAsset): number {
  // 0 beats 1: a READY asset settles the key no matter how old it is.
  return asset.status === 'READY' ? 0 : 1;
}

function recency(asset: ResumeAsset): number {
  if (!asset.createdAt) return 0;
  const at = new Date(asset.createdAt).getTime();
  return Number.isFinite(at) ? at : 0;
}

/**
 * A total order, so the winner never depends on input order. READY first, then the
 * newest row, then the greatest id (cuid ids sort by creation time).
 */
export function preferAsset(left: ResumeAsset, right: ResumeAsset): ResumeAsset {
  const rank = readinessRank(left) - readinessRank(right);
  if (rank !== 0) return rank < 0 ? left : right;
  const age = recency(left) - recency(right);
  if (age !== 0) return age > 0 ? left : right;
  return left.id >= right.id ? left : right;
}

export interface ResumeIndex {
  byKey: Map<string, ResumeAsset>;
  /**
   * Duplicates that are still waiting or in flight — `QUEUED` or `GENERATING` — under a key a READY
   * row already settles. That is work which will never run: the observed three, and a stuck
   * `GENERATING` row. A `FAILED` take is a terminal, honest record of a failed attempt, so it is
   * deliberately NOT counted here; the take model means a scene legitimately has several rows.
   */
  shadowed: ResumeAsset[];
}

/** Statuses that still expect the runner to do something. `FAILED` is terminal: it already ran. */
const NON_TERMINAL = new Set(['QUEUED', 'GENERATING']);

export function buildResumeIndex(assets: ResumeAsset[]): ResumeIndex {
  const byKey = new Map<string, ResumeAsset>();
  for (const asset of assets) {
    const key = resumeKey(asset);
    const current = byKey.get(key);
    byKey.set(key, current ? preferAsset(current, asset) : asset);
  }
  const shadowed = assets.filter(
    (asset) => NON_TERMINAL.has(asset.status) && byKey.get(resumeKey(asset))?.status === 'READY',
  );
  return { byKey, shadowed };
}
