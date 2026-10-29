/**
 * D-004 - stitch a scene's shot clips into one hero video.
 *
 * The multi-shot engine writes individual `StorySceneAsset` rows tagged with
 * `shotIndex`; nothing joined them, so a multi-shot scene could not be published
 * or downloaded as one file. This closes that loop.
 *
 * Design notes:
 *  - Ordering and eligibility are pure functions, because those are the rules
 *    most likely to be wrong (a gap in shotIndex, a GENERATING clip, a single
 *    clip that needs no concat).
 *  - FFmpeg and the upload are injected so unit tests never shell out.
 *  - Stream-copy (`-c copy`) is deliberate: every clip comes from the same
 *    encoder settings, and re-encoding would cost minutes and lose quality. If
 *    the copies are incompatible FFmpeg fails loudly rather than silently
 *    producing a broken file, which is the behaviour we want to surface.
 */

export interface ShotClipLike {
  id: string;
  shotIndex: number | null;
  status: string;
  assetUrl: string | null;
}

export type ConcatPlan =
  | { ok: true; ordered: ShotClipLike[]; totalSeconds?: number }
  | { ok: false; reason: 'no_clips' | 'not_enough_clips' | 'missing_shot' | 'still_rendering' };

/**
 * Decide whether a set of clips can be concatenated, and in what order.
 *
 * A gap in `shotIndex` is refused rather than silently skipped: stitching 1,3,4
 * would produce a video that looks right and is missing a beat of the story.
 */
export function planConcat(clips: ShotClipLike[]): ConcatPlan {
  const withUrl = clips.filter((c) => c.assetUrl);

  if (withUrl.length === 0) return { ok: false, reason: 'no_clips' };
  if (withUrl.some((c) => c.status !== 'READY')) return { ok: false, reason: 'still_rendering' };

  const ordered = [...withUrl].sort((a, b) => (a.shotIndex ?? 0) - (b.shotIndex ?? 0));

  const indices = ordered.map((c) => c.shotIndex).filter((i): i is number => i !== null);
  if (indices.length !== ordered.length) return { ok: false, reason: 'missing_shot' };

  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i] !== i) return { ok: false, reason: 'missing_shot' };
  }

  if (ordered.length < 2) return { ok: false, reason: 'not_enough_clips' };

  return { ok: true, ordered };
}

/** ffmpeg concat demuxer list file. Paths are single-quoted and escaped. */
export function buildConcatList(paths: string[]): string {
  return paths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
    .concat('\n');
}

export interface ConcatDeps {
  /** Download a remote URL to a local path. */
  download: (url: string, filePath: string) => Promise<void>;
  /** Run ffmpeg; must reject on non-zero exit. */
  runFfmpeg: (args: string[]) => Promise<void>;
  /** Upload the finished MP4 and return its public URL. */
  upload: (filePath: string, key: string) => Promise<string>;
  /** Scratch directory for this run. */
  workDir: string;
  /** Storage key for the result, e.g. `story-projects/<id>/scenes/<id>/stitched.mp4`. */
  outputKey: string;
}

export interface ConcatResult {
  outputUrl: string;
  clipCount: number;
}

/**
 * Download → concat → upload. Throws on any failure; callers map that to a user
 * message and must not create the hero asset row unless this resolves.
 */
export async function concatShotClips(
  clips: ShotClipLike[],
  deps: ConcatDeps,
): Promise<ConcatResult> {
  const plan = planConcat(clips);
  if (!plan.ok) throw new Error(`Cannot stitch shots: ${plan.reason}`);

  const localPaths: string[] = [];
  for (let i = 0; i < plan.ordered.length; i += 1) {
    const clip = plan.ordered[i];
    const filePath = `${deps.workDir}/shot-${i}.mp4`;
    await deps.download(clip.assetUrl as string, filePath);
    localPaths.push(filePath);
  }

  const listPath = `${deps.workDir}/concat.txt`;
  const fs = await import('node:fs/promises');
  await fs.writeFile(listPath, buildConcatList(localPaths), 'utf8');

  const outPath = `${deps.workDir}/stitched.mp4`;
  await deps.runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outPath,
  ]);

  const outputUrl = await deps.upload(outPath, deps.outputKey);
  return { outputUrl, clipCount: plan.ordered.length };
}
