/**
 * D-031 — hard bounds for every ffmpeg invocation in the export path.
 *
 * One runaway export ran 4h27m, wrote 20 GB and starved the shared VPS
 * (Raivstream shares CPU/RAM with UltraLeague and Powervend). These caps are
 * guardrails, not behaviour changes: a legitimate export never reaches them.
 *
 * Tuning lives here so it is a single edit. Rationale for the values:
 *  - Legitimate exports currently take ~10 min on this VPS; 1800 s (-t) is 3x headroom.
 *  - The 25 min wall-clock timeout is a backstop for HUNG processes: >2.5x the
 *    observed legitimate runtime, and <1/10 of the 4h27m runaway.
 *  - `-t` bounds OUTPUT DURATION; the timeout bounds WALL-CLOCK. They measure
 *    different things, so they are deliberately not equal.
 */
export const FFMPEG_MAX_DURATION_SECONDS = 1800; // 30 min per ffmpeg step (-t)
export const FFMPEG_TIMEOUT_MS = 25 * 60 * 1000; // 25 min wall-clock per spawn
/** ffmpeg -fs accepts sizes like 500M / 2G. */
export const FFMPEG_MAX_FILE_SIZE_SCENE = '500M'; // -fs, per-scene mux (byte string form)
export const FFMPEG_MAX_FILE_SIZE_CONCAT = '2G'; // -fs, final concat
export const FFMPEG_THREADS = 2; // limit CPU on the shared VPS
/**
 * Wall-clock bound for probe/metadata spawns (ffprobe, `ffmpeg -filters`, single
 * last-frame extraction). These are supposed to finish in milliseconds and have
 * no output duration to scale a timeout from, so they get a flat cap — a hung
 * probe reading a slow remote URL would otherwise block an export forever.
 */
export const FFMPEG_PROBE_TIMEOUT_MS = 60_000;
export const EXPORT_STUCK_THRESHOLD_MS = 30 * 60 * 1000; // startup sweep

export interface FfmpegSafetyOptions {
  /** Override the -fs value (defaults to the per-scene cap). */
  maxFileSize?: string;
}

/**
 * Insert the D-031 safety flags at the start of the OUTPUT section of an ffmpeg
 * argv, i.e. after the last input.
 *
 * Two things this gets right that a naive version does not:
 *
 *  1. It inserts, never appends. An output option written after the output path
 *     is parsed as an option for a *second* output that never arrives, so ffmpeg
 *     rejects the command. Appending looks harmless and silently does nothing
 *     useful — which is how the first cut of PR A shipped a helper no call site
 *     could use.
 *  2. It only inspects the output section. A `-t` before an `-i` is an INPUT
 *     option (the end card sets `-t 2` on its lavfi inputs) and does not bound
 *     the output at all, so counting it would drop the real output cap.
 *
 * Idempotent: a flag already in the output section is left untouched (callers
 * may set a tighter -t, e.g. the per-scene narration duration).
 */
export function applyFfmpegSafety(args: string[], opts: FfmpegSafetyOptions = {}): string[] {
  const out = [...args];
  let outputStart = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === '-i') outputStart = i + 2; // skip `-i` and its input path
  }
  const outputArgs = out.slice(outputStart);
  const has = (flag: string) => outputArgs.includes(flag);

  const additions: string[] = [];
  if (!has('-t')) additions.push('-t', String(FFMPEG_MAX_DURATION_SECONDS));
  if (!has('-fs')) additions.push('-fs', opts.maxFileSize ?? FFMPEG_MAX_FILE_SIZE_SCENE);
  if (!has('-threads')) additions.push('-threads', String(FFMPEG_THREADS));
  if (additions.length === 0) return out;

  out.splice(Math.min(outputStart, out.length), 0, ...additions);
  return out;
}

export interface FfmpegAbort {
  signal: AbortSignal;
  /** Clear the timer once the spawn has exited (avoids a dangling timer). */
  cancel: () => void;
}

/**
 * Timeout-bounded abort for an ffmpeg spawn. Uses an explicit AbortController +
 * setTimeout (not AbortSignal.timeout) so tests can drive it with fake timers.
 */
export function ffmpegAbortSignal(ms: number = FFMPEG_TIMEOUT_MS): FfmpegAbort {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`ffmpeg timed out after ${ms}ms`));
  }, ms);
  // Do not keep the event loop alive solely for this timer.
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as unknown as { unref: () => void }).unref();
  }
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** Typed export failure reasons (mapped to user-facing copy by the caller). */
export type ExportFailureCode = 'EXPORT_TIMEOUT' | 'EXPORT_SIZE_LIMIT' | 'EXPORT_BUSY' | 'EXPORT_STUCK';

export class ExportFailure extends Error {
  readonly code: ExportFailureCode;
  constructor(code: ExportFailureCode, message: string) {
    super(message);
    this.name = 'ExportFailure';
    this.code = code;
  }
}

/**
 * Classify an ffmpeg failure. `-fs` makes ffmpeg exit non-zero with a
 * "File size limit" / "Output file is empty" signature in stderr.
 */
export function classifyFfmpegFailure(stderr: string): ExportFailureCode | null {
  if (/file size limit|output file is empty/i.test(stderr)) return 'EXPORT_SIZE_LIMIT';
  if (/timed out|killed/i.test(stderr)) return 'EXPORT_TIMEOUT';
  return null;
}
