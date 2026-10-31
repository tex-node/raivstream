/**
 * Raivstream 5.0 — Output renderer (Slice 5B).
 *
 * Assembles the version's produced scene clips (in plan order, stills as
 * fallback) into ONE derivative video: center-crop to the target aspect,
 * normalize fps/timebase, then trim to the effective duration. This is the
 * mechanic behind "give me a vertical version for social" — the user never
 * specifies crops or cut points. Dependencies are injectable for hermetic tests.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, rename , stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uploadBufferToR2 } from '../../r2';
import { trackChild } from '../../childProcesses';
import type { OutputDerivation } from './derivation';

export interface OutputRenderDeps {
  fetch?: typeof fetch;
  ffmpeg?: (args: string[]) => Promise<void>;
  upload?: (buffer: Buffer, key: string, contentType: string) => Promise<string | null>;
  /** Override the end-card preflight (tests inject a known-good or known-bad result). */
  endCardPreflight?: () => Promise<EndCardPreflightResult>;
  /**
   * E1 — probe a local media file for a native audio stream + duration. Injected
   * in tests (ffmpeg/ffprobe are not available in CI unit runs); defaults to a
   * real `ffprobe` call. Used to decide whether a source clip carries audio and
   * how to position it in the ambience bed.
   */
  probe?: (filePath: string) => Promise<MediaProbe>;
}

/** E1 — native-audio probe result for a source clip. */
export interface MediaProbe {
  hasAudioStream: boolean;
  durationSeconds: number | null;
}

async function probeWithFfprobe(filePath: string): Promise<MediaProbe> {
  return new Promise<MediaProbe>((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    // D-031: ffprobe reads a possibly-remote URL. Without a bound, a stalled
    // socket hangs the export before ffmpeg is ever spawned.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, FFMPEG_PROBE_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => { out += String(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { err += String(chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`ffprobe timed out after ${FFMPEG_PROBE_TIMEOUT_MS}ms`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffprobe exited with ${code}: ${err.slice(-500)}`));
        return;
      }
      try {
        const parsed = JSON.parse(out) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
        const hasAudioStream = (parsed.streams ?? []).some((s) => s.codec_type === 'audio');
        const durationSeconds = parsed.format?.duration ? Number(parsed.format.duration) : null;
        resolve({ hasAudioStream, durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null });
      } catch (parseError) {
        reject(parseError instanceof Error ? parseError : new Error('ffprobe output unparseable'));
      }
    });
  });
}

/** Wall-clock ceiling per ffmpeg spawn. A looped input can otherwise encode forever. */
const FFMPEG_MIN_WALL_MS = 60_000;
const FFMPEG_MAX_WALL_MS = 4 * 60 * 1000;

async function runFfmpeg(args: string[], expectedSeconds = 0): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // D-031: every export ffmpeg gets -t/-fs/-threads inserted in front of its
    // output. Call sites may set a tighter -t; this is the floor, applied once
    // here instead of trusting ~10 hand-built argv arrays to stay in sync.
    const child = spawn('ffmpeg', ['-y', ...applyFfmpegSafety(args)], { stdio: ['ignore', 'ignore', 'pipe'] });
    // D-033 — track so the worker can reap encoders on shutdown.
    trackChild(child);
    let stderr = '';
    let timedOut = false;
    const timeoutMs = Math.min(
      FFMPEG_MAX_WALL_MS,
      Math.max(FFMPEG_MIN_WALL_MS, Math.round(expectedSeconds * 1000 * 4)),
    );
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`ffmpeg timed out (killed) after ${timeoutMs}ms`));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * E1 — export-renderer version, folded into the export cache key
 * (`computeSourceHash`, storyVideoExportService.ts). Bump whenever the rendered
 * output changes for the SAME source inputs (e.g. E1 preserved source-clip native
 * audio), so already-cached exports are invalidated and re-render. Mirrors
 * `MOVIE_RENDERER_VERSION` (movieRenderPlanning.ts).
 *
 * `phase-3-v2`: E1 — source clip native audio is now carried into the export
 * (previously narration + background music only, so audio-less-cue exports were
 * silent). Existing silent exports must re-render.
 */
export const EXPORT_RENDERER_VERSION = 'phase-3-v2';

/** Appended end-card duration, in seconds (added to every derivative). */
export const END_CARD_SECONDS = 2;
/** Fallback attribution handle when a creator username is unavailable. */
export const END_CARD_FALLBACK_HANDLE = 'raivstream';

/**
 * Escape a value for ffmpeg `drawtext=text='…'`. drawtext treats `\ : ' % ,` as
 * special characters, so a username containing any of them (apostrophes are the
 * realistic case) would otherwise break the filter graph or swallow text.
 */
export function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

export interface EndCardOptions {
  /** Already-rendered main video; its duration/streams are preserved. */
  mainPath: string;
  /** Whether the main already carries an audio stream. */
  mainHasAudio: boolean;
  /** Main duration; used to synthesise matching silent audio when mainHasAudio is false. */
  mainDurationSeconds: number;
  outputPath: string;
  width: number;
  height: number;
  handle: string;
  /** Optional explicit font file; when omitted, fontconfig picks the default. */
  fontFile?: string | null;
}

/**
 * Build the ffmpeg arguments that append a {@link END_CARD_SECONDS}-second end card
 * to an already-rendered main video.
 *
 * Fully synthesised (no external asset): a black `color` card with three
 * `drawtext` lines — "Created on Raivstream", the creator's `@handle`, and
 * "RAIVSTREAM" — concatenated after the main output with a silent audio track so
 * the result is one continuous video+audio stream. The main is re-encoded with the
 * same codec/pixel format (9:16 output is unchanged in resolution/framerate).
 */
export function buildEndCardArgs(opts: EndCardOptions): string[] {
  const { mainPath, mainHasAudio, mainDurationSeconds, outputPath, width, height, handle, fontFile } = opts;
  const font = fontFile ? `:fontfile='${fontFile.replace(/'/g, "\\'")}'` : '';
  const big = Math.max(28, Math.round(width / 18));
  const mid = Math.max(24, Math.round(width / 24));
  const small = Math.max(18, Math.round(width / 40));
  const handleText = escapeDrawtext(`@${handle}`);

  const colorSrc = `color=c=black:s=${width}x${height}:d=${END_CARD_SECONDS}:r=30`;
  const silence = 'anullsrc=channel_layout=stereo:sample_rate=48000';

  const drawCards =
    `drawtext=text='Created on Raivstream'${font}:fontcolor=white@0.9:fontsize=${small}:x=(w-text_w)/2:y=h/2-${Math.round(big * 1.4)},` +
    `drawtext=text='${handleText}'${font}:fontcolor=white:fontsize=${big}:x=(w-text_w)/2:y=h/2-${Math.round(big / 2)},` +
    `drawtext=text='RAIVSTREAM'${font}:fontcolor=white@0.85:fontsize=${mid}:x=(w-text_w)/2:y=h/2+${Math.round(big * 0.8)}`;

  const mainV = '[0:v]fps=30,setsar=1,format=yuv420p[v0]';

  const tail = [
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ];

  if (mainHasAudio) {
    // Inputs: 0 = main (v+a), 1 = color card, 2 = silent card audio.
    const filter = [
      mainV,
      `[1:v]fps=30,setsar=1,format=yuv420p,${drawCards}[v1]`,
      '[2:a]asetpts=PTS-STARTPTS[cdra]',
      '[v0][0:a][v1][cdra]concat=n=2:v=1:a=1[v][a]',
    ].join(';');
    return [
      '-i', mainPath,
      '-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', colorSrc,
      '-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', silence,
      '-filter_complex', filter,
      ...tail,
    ];
  }

  // Inputs: 0 = main (v only), 1 = main silent audio, 2 = color card, 3 = silent card audio.
  const filter = [
    mainV,
    `[2:v]fps=30,setsar=1,format=yuv420p,${drawCards}[v1]`,
    '[3:a]asetpts=PTS-STARTPTS[cdra]',
    '[v0][1:a][v1][cdra]concat=n=2:v=1:a=1[v][a]',
  ].join(';');
  return [
    '-i', mainPath,
    '-f', 'lavfi', '-t', String(mainDurationSeconds), '-i', silence,
    '-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', colorSrc,
    '-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', silence,
    '-filter_complex', filter,
    ...tail,
  ];
}

/**
 * E1 — extract a source clip's native audio into a canonical PCM bed, looped to
 * `durationSeconds`. Mirrors `movieRenderWorker.extractNativeAudio`. Keeps the
 * clip's own synchronized audio (e.g. MiniMax H3 SFX) so stitched exports are
 * not silent when there is no narration/music cue.
 */
async function extractNativeAudioBed(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
  run: (args: string[]) => Promise<void>,
): Promise<void> {
  await run([
    '-stream_loop', '-1',
    '-i', inputPath,
    '-t', Math.max(0.5, durationSeconds).toFixed(3),
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    outputPath,
  ]);
}

/** E1 — one audible source clip's native audio, positioned on the export timeline. */
export interface NativeAudioSource {
  filePath: string;
  startSeconds: number;
  durationSeconds: number;
}

/**
 * E1 — mux a native-audio ambience bed (one delayed stream per audible source
 * clip) into a rendered video. When `videoPath` already carries audio (e.g. a
 * background-music mix) the bed is combined with it via amix; otherwise the bed
 * becomes the output's audio. Returns the input path unchanged when there are no
 * native sources (preserving the pre-E1 silent behavior for audio-less sources).
 */
async function muxNativeAudioBed(opts: {
  videoPath: string;
  nativeSources: NativeAudioSource[];
  outputPath: string;
  dir: string;
  run: (args: string[]) => Promise<void>;
  hasExistingAudio: boolean;
}): Promise<string> {
  const { videoPath, nativeSources, outputPath, dir, run, hasExistingAudio } = opts;
  if (nativeSources.length === 0) return videoPath;

  const bedFiles: string[] = [];
  for (let i = 0; i < nativeSources.length; i += 1) {
    const src = nativeSources[i]!;
    const wav = path.join(dir, `native-${i}.wav`);
    await extractNativeAudioBed(src.filePath, wav, src.durationSeconds, run);
    bedFiles.push(wav);
  }

  const delays = bedFiles.map((_, i) => {
    const ms = Math.max(0, Math.round(nativeSources[i]!.startSeconds * 1000));
    return `[${i + 1}:a]adelay=${ms}|${ms}[n${i}]`;
  });
  const labels = bedFiles.map((_, i) => `[n${i}]`).join('');
  const bed = bedFiles.length === 1
    ? delays[0]!.replace('[n0]', '[amb]')
    : `${delays.join(';')};${labels}amix=inputs=${bedFiles.length}:normalize=0[amb]`;
  const filter = hasExistingAudio
    ? `[0:a]volume=1[base];${bed};[base][amb]amix=inputs=2:normalize=0[aout]`
    : bed;

  await run([
    '-i', videoPath,
    ...bedFiles.flatMap((f) => ['-i', f]),
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', hasExistingAudio ? '[aout]' : '[amb]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    // D-031: explicit bound instead of -shortest (the video input is finite).
    '-t', String(FFMPEG_MAX_DURATION_SECONDS),
    '-fs', String(FFMPEG_MAX_FILE_SIZE_SCENE),
    '-movflags', '+faststart',
    outputPath,
  ]);
  return outputPath;
}

import {
  applyFfmpegSafety,
  FFMPEG_MAX_DURATION_SECONDS,
  FFMPEG_MAX_FILE_SIZE_CONCAT,
  FFMPEG_MAX_FILE_SIZE_SCENE,
  FFMPEG_PROBE_TIMEOUT_MS,
} from '../../ffmpegSafety';

export interface EndCardPreflightResult {
  /** ffmpeg was built with the drawtext filter (`--enable-libfreetype`). */
  drawtext: boolean;
  /** A usable font is resolvable (explicit `RAIVSTREAM_END_CARD_FONT`, or fontconfig). */
  font: boolean;
  /** Both are present, so the end card will render. */
  ok: boolean;
}

/** Typed marker for a preflight failure (best-effort: the card is skipped). */
export const END_CARD_PREFLIGHT_FAILED = 'END_CARD_PREFLIGHT_FAILED';

/** Human-readable reason + fix for a failed preflight. */
export function preflightFailureMessage(result: EndCardPreflightResult): string {
  const parts: string[] = [];
  if (!result.drawtext) parts.push('ffmpeg lacks the drawtext filter (rebuild with --enable-libfreetype)');
  if (!result.font) parts.push('no font is resolvable (apt install fonts-dejavu-core, or set RAIVSTREAM_END_CARD_FONT)');
  return `${END_CARD_PREFLIGHT_FAILED}: ${parts.join('; ') || 'unknown'}`;
}

const END_CARD_OK: EndCardPreflightResult = { drawtext: true, font: true, ok: true };

async function runCapture(command: string, args: string[]): Promise<{ code: number; out: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    // D-031: metadata/feature probes get the flat probe cap; a hung `ffmpeg
    // -filters` or `fc-match` must not stall the end-card preflight forever.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${FFMPEG_PROBE_TIMEOUT_MS}ms`));
    }, FFMPEG_PROBE_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      out += String(chunk);
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
  });
}

let endCardPreflightCache: Promise<EndCardPreflightResult> | null = null;

/** Test hook — clears the cached preflight so a fresh check runs. */
export function resetEndCardPreflightForTests(): void {
  endCardPreflightCache = null;
}

/**
 * Best-effort end-card preflight, run ONCE per process (cached). Verifies ffmpeg
 * has `drawtext` and that a font is resolvable. A failure does NOT abort the
 * export — the caller skips the card with a loud log and uploads the main output
 * (the export matters more than the two-second branding).
 */
export function runEndCardPreflight(): Promise<EndCardPreflightResult> {
  if (!endCardPreflightCache) endCardPreflightCache = doEndCardPreflight();
  return endCardPreflightCache;
}

async function doEndCardPreflight(): Promise<EndCardPreflightResult> {
  const explicitFont = process.env.RAIVSTREAM_END_CARD_FONT?.trim();

  let drawtext = false;
  try {
    const { code, out } = await runCapture('ffmpeg', ['-hide_banner', '-filters']);
    drawtext = code === 0 && /\bdrawtext\b/.test(out);
  } catch {
    drawtext = false;
  }

  let font = Boolean(explicitFont);
  if (!font) {
    try {
      font = (await runCapture('fc-match', ['sans-serif'])).code === 0;
    } catch {
      font = false;
    }
  }

  return { drawtext, font, ok: drawtext && font };
}

export interface RenderScene {
  sceneId: string;
  videoUrl?: string | null;
  stillUrl?: string | null;
  /** Narration audio URL for educational mux (R2-hosted MP3). Server-side only — never accepted from client input. */
  audioUrl?: string | null;
}

export async function renderOutputDerivative(
  input: {
    scenes: RenderScene[];
    derivation: OutputDerivation;
    r2Prefix: string;
    backgroundMusicUrl?: string | null;
    /**
     * Creator's public handle for the end card. Derived from trusted account data
     * by each caller — never from client input. Falls back to a generic label.
     */
    creatorHandle?: string | null;
    /** Export row id for structured logging. Passed by storyVideoExportService. */
    exportId?: string;
  },
  deps: OutputRenderDeps = {},
): Promise<{ assetUrl: string; endCardApplied: boolean; durationSeconds?: number | null }> {
  const doFetch = deps.fetch ?? fetch;
  const doFfmpeg = deps.ffmpeg ?? runFfmpeg;
  const doUpload = deps.upload ?? uploadBufferToR2;
  const doProbe = deps.probe ?? probeWithFfprobe;
  // Preflight guards the REAL ffmpeg; an injected runner owns its own environment.
  const preflight = deps.endCardPreflight ?? (deps.ffmpeg ? async () => END_CARD_OK : runEndCardPreflight);

  const { targetWidth: W, targetHeight: H } = input.derivation;
  const handle = (input.creatorHandle ?? '').trim() || END_CARD_FALLBACK_HANDLE;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'raivstream-output-'));

  // Append the 2s end card to the main output, or (best-effort) fall back to it.
  const appendEndCard = async (
    mainPath: string,
    mainHasAudio: boolean,
    mainDurationSeconds: number,
  ): Promise<{ path: string; applied: boolean; reason: string }> => {
    const pre = await preflight();
    if (!pre.ok) {
      const reason = !pre.drawtext ? 'drawtext' : !pre.font ? 'font' : 'other';
      console.warn(`[end-card] skipped: ${preflightFailureMessage(pre)}`);
      return { path: mainPath, applied: false, reason };
    }
    const final = path.join(dir, 'final.mp4');
    await doFfmpeg(buildEndCardArgs({
      mainPath,
      mainHasAudio,
      mainDurationSeconds,
      outputPath: final,
      width: W,
      height: H,
      handle,
      fontFile: process.env.RAIVSTREAM_END_CARD_FONT ?? null,
    }));
    return { path: final, applied: true, reason: 'n/a' };
  };

  try {
    const hasAudio = input.scenes.some((s) => s.audioUrl);

    // ── Audio mux path (educational: per-scene loop+mux then concat) ──────────
    if (hasAudio) {
      // All scenes must have audio when any do — validated upstream but checked here.
      const missingAudio = input.scenes.filter((s) => !s.audioUrl).map((s) => s.sceneId);
      if (missingAudio.length > 0) {
        throw new Error(`Audio mux mode requires all scenes to have audioUrl. Missing: ${missingAudio.join(', ')}`);
      }

      const sceneParts: string[] = [];
      for (let i = 0; i < input.scenes.length; i++) {
        const scene = input.scenes[i]!;
        const videoSrc = scene.videoUrl ?? scene.stillUrl;
        if (!videoSrc) throw new Error(`Scene ${scene.sceneId} has no video source for audio mux.`);

        // Download video
        const vFile = path.join(dir, `v-${i}.bin`);
        const vResp = await doFetch(videoSrc);
        if (!vResp.ok) throw new Error(`Failed to fetch video for scene ${scene.sceneId} (${vResp.status})`);
        await writeFile(vFile, Buffer.from(await vResp.arrayBuffer()));

        // Download narration audio
        const aFile = path.join(dir, `a-${i}.bin`);
        const aResp = await doFetch(scene.audioUrl!);
        if (!aResp.ok) throw new Error(`Failed to fetch narration audio for scene ${scene.sceneId} (${aResp.status})`);
        await writeFile(aFile, Buffer.from(await aResp.arrayBuffer()));

        // Per-scene mux: loop video infinitely, end when narration audio ends.
        // Use -t <narration_duration> (probed via ffprobe) instead of -shortest.
        // -shortest is unreliable when -stream_loop -1 feeds a -filter_complex graph:
        // stream_loop overrides the looped input's EOF so the filter graph never sees
        // a finite boundary. Without -t, a 7.6 s narration produced an infinite encode
        // (observed: 4 h 27 min / 20 GB in production — incident ca25).
        const sceneOut = path.join(dir, `scene-${i}.mp4`);
        const [vProbe, aProbe] = await Promise.all([
          doProbe(vFile).catch(() => ({ hasAudioStream: false, durationSeconds: null }) as MediaProbe),
          doProbe(aFile).catch(() => ({ hasAudioStream: true, durationSeconds: null }) as MediaProbe),
        ]);
        // Explicit duration cap. NEVER fall back to -shortest (unbounded with
        // -stream_loop -1). If ffprobe failed, use a safe cap: the clip's own
        // duration, else 15 s.
        const safeCapSeconds = aProbe.durationSeconds ?? vProbe.durationSeconds ?? 15;
        const durationArgs: string[] = ['-t', safeCapSeconds.toFixed(3)];
        if (vProbe.hasAudioStream) {
          // E1 — keep the source clip's native audio (e.g. H3 SFX) alongside the
          // narration: amix them so the stitched export is not narration-only.
          await doFfmpeg([
            // Loop the VIDEO only. The clip is opened twice: input 0 is looped
            // (video), input 1 is NOT looped and supplies the clip's own audio.
            // -stream_loop -1 on a single input would loop its audio too, making
            // the amix bed infinite (incident ca25: 4h27m / 20GB).
            '-stream_loop', '-1',
            '-i', vFile,
            '-i', vFile,
            '-i', aFile,
            '-filter_complex',
              `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v];` +
              `[1:a]volume=1[na];[2:a]volume=1[nr];[na][nr]amix=inputs=2:duration=longest:normalize=0[aout]`,
            '-map', '[v]',
            '-map', '[aout]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-fs', String(FFMPEG_MAX_FILE_SIZE_SCENE),
            ...durationArgs,
            sceneOut,
          ]);
        } else {
          // No native audio on the source clip — narration-only.
          await doFfmpeg([
            '-stream_loop', '-1',
            '-i', vFile,
            '-i', aFile,
            '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v]`,
            '-map', '[v]',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-fs', String(FFMPEG_MAX_FILE_SIZE_SCENE),
            ...durationArgs,
            sceneOut,
          ]);
        }
        sceneParts.push(sceneOut);
      }

      // Concat all per-scene muxed clips into the final export.
      const concat = path.join(dir, 'concat.mp4');
      const n = sceneParts.length;
      const segLabels = sceneParts.map((_, i) => `[${i}:v][${i}:a]`).join('');
      await doFfmpeg([
        ...sceneParts.flatMap((f) => ['-i', f]),
        '-filter_complex', `${segLabels}concat=n=${n}:v=1:a=1[vout][aout]`,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-t', String(FFMPEG_MAX_DURATION_SECONDS),
        '-fs', String(FFMPEG_MAX_FILE_SIZE_CONCAT),
        '-movflags', '+faststart',
        concat,
      ]);

      const out = path.join(dir, 'out.mp4');
      if (input.backgroundMusicUrl) {
        // Mux background music under narration: loop music to full video length,
        // mix at 0.3 weight (narration 1.0), fade in/out 1 s each end.
        const mFile = path.join(dir, 'bg.bin');
        const mResp = await doFetch(input.backgroundMusicUrl);
        if (!mResp.ok) throw new Error(`Failed to fetch background music (${mResp.status})`);
        await writeFile(mFile, Buffer.from(await mResp.arrayBuffer()));
        await doFfmpeg([
          '-i', concat,
          '-stream_loop', '-1', '-i', mFile,
          '-filter_complex',
            // Narration: fade in 1 s only (duration unknown at build time; let -shortest cut it).
            '[0:a]afade=t=in:ss=0:d=1[narr];' +
            // Music: fade in 1 s, reduce to 30% volume.
            '[1:a]afade=t=in:ss=0:d=1,volume=0.3[bgm];' +
            '[narr][bgm]amix=inputs=2:duration=first:dropout_transition=2[amixed]',
          '-map', '0:v',
          '-map', '[amixed]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          // D-031: amix duration=first already bounds at the finite concat; the
          // explicit caps are backstops instead of -shortest.
          '-t', String(FFMPEG_MAX_DURATION_SECONDS),
          '-fs', String(FFMPEG_MAX_FILE_SIZE_CONCAT),
          '-movflags', '+faststart',
          out,
        ]);
      } else {
        // No background music — rename concat output as final.
        await rename(concat, out);
      }

      const card = await appendEndCard(out, true, 0);
      const buffer = await readFile(card.path);
      const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${card.path}`;
      console.info(`[export.endcard] applied=${card.applied} reason=${card.reason} exportId=${input.exportId ?? 'unknown'}`);
      // Probe the FINISHED file rather than trusting the planned sum: the
      // renderer pads, trims and appends a 2s card, so the planned total is not
      // the artefact (the 9B.1A lesson: expected 12, actual 8.57).
      const measured = await doProbe(card.path).catch(() => ({ durationSeconds: null }));
      return { assetUrl, endCardApplied: card.applied, durationSeconds: measured.durationSeconds };
    }

    // ── Video-only path (non-educational, existing behavior unchanged) ─────────
    const inputs: string[] = [];
    for (const scene of input.scenes) {
      const url = scene.videoUrl ?? scene.stillUrl;
      if (!url) continue;
      const file = path.join(dir, `src-${inputs.length}.bin`);
      const response = await doFetch(url);
      // A skipped input used to `continue`, which left the filter graph and the
      // concat count disagreeing - the silent "holds the last frame" failure.
      if (!response.ok) {
        throw new Error(`[export.concat] fetch failed for scene ${scene.sceneId}: HTTP ${response.status}`);
      }
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      inputs.push(file);
    }
    if (inputs.length === 0) throw new Error('No source media available to derive an output.');

    // E1 — probe each source clip for a native audio stream + duration so its
    // audio can be carried into the export, positioned on the timeline. Sources
    // without audio (e.g. stills) are skipped, exactly as before.
    const nativeSources: NativeAudioSource[] = [];
    let cursorSeconds = 0;
    for (const file of inputs) {
      const probe = await doProbe(file).catch(() => ({ hasAudioStream: false, durationSeconds: null }) as MediaProbe);
      if (probe.hasAudioStream) {
        nativeSources.push({
          filePath: file,
          startSeconds: cursorSeconds,
          durationSeconds: probe.durationSeconds ?? input.derivation.effectiveDurationSeconds,
        });
      }
      cursorSeconds += probe.durationSeconds ?? 0;
    }

    const parts = inputs.map(
      (_, index) => `[${index}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v${index}]`,
    );
    const labels = inputs.map((_, index) => `[v${index}]`).join('');
    const concat = `${labels}concat=n=${inputs.length}:v=1:a=0[vout]`;
    const filter = [...parts, concat].join(';');

    // Diagnostic: the concat count must equal the labels it is actually fed. A
    // silent hold-frame is exactly what a mismatch looks like from the outside.
    const labelRefs = (filter.match(/\[v\d+\]/g) ?? []).length;
    console.info(
      `[export.concat] scenes=${input.scenes.length} inputs=${inputs.length} n=${inputs.length} labels=${labelRefs}`,
    );
    for (let i = 0; i < inputs.length; i++) {
      const info = await doProbe(inputs[i]!).catch(() => ({ durationSeconds: null }) as MediaProbe);
      const bytes = await stat(inputs[i]!).then((s) => s.size).catch(() => -1);
      console.info(`[export.concat] input ${i} bytes=${bytes} duration=${info.durationSeconds ?? 'null'}`);
    }

    if (input.backgroundMusicUrl) {
      // Video-only path + background music: produce a video+audio output.
      const videoOnly = path.join(dir, 'video-only.mp4');
      await doFfmpeg([
        ...inputs.flatMap((file) => ['-i', file]),
        '-filter_complex', filter,
        '-map', '[vout]',
        '-t', String(input.derivation.effectiveDurationSeconds),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        videoOnly,
      ]);
      const mFile = path.join(dir, 'bg.bin');
      const mResp = await doFetch(input.backgroundMusicUrl);
      if (!mResp.ok) throw new Error(`Failed to fetch background music (${mResp.status})`);
      await writeFile(mFile, Buffer.from(await mResp.arrayBuffer()));
      const out = path.join(dir, 'out.mp4');
      const totalDur = input.derivation.effectiveDurationSeconds;
      const fadeOutStart = Math.max(0, totalDur - 1);
      await doFfmpeg([
        '-i', videoOnly,
        '-stream_loop', '-1', '-i', mFile,
        '-filter_complex',
          `[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=${fadeOutStart}:d=1,volume=0.3,atrim=duration=${totalDur}[bgmt]`,
        '-map', '0:v',
        '-map', '[bgmt]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        // D-031: atrim already bounds at totalDur; caps replace -shortest.
        '-t', String(FFMPEG_MAX_DURATION_SECONDS),
        '-fs', String(FFMPEG_MAX_FILE_SIZE_CONCAT),
        '-movflags', '+faststart',
        out,
      ]);
      // E1 — carry the source clips' native audio into the music mix.
      const mixed = await muxNativeAudioBed({
        videoPath: out,
        nativeSources,
        outputPath: path.join(dir, 'out-with-native.mp4'),
        dir,
        run: doFfmpeg,
        hasExistingAudio: true,
      });
      const card = await appendEndCard(mixed, true, input.derivation.effectiveDurationSeconds);
      const buffer = await readFile(card.path);
      const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${card.path}`;
      console.info(`[export.endcard] applied=${card.applied} reason=${card.reason} exportId=${input.exportId ?? 'unknown'}`);
      // Probe the FINISHED file rather than trusting the planned sum: the
      // renderer pads, trims and appends a 2s card, so the planned total is not
      // the artefact (the 9B.1A lesson: expected 12, actual 8.57).
      const measured = await doProbe(card.path).catch(() => ({ durationSeconds: null }));
      return { assetUrl, endCardApplied: card.applied, durationSeconds: measured.durationSeconds };
    }

    // ── Phase 2 A/B: per-segment renders behind RENDER_SEGMENTS_ENABLED ────────
    // The graph above is a hard-cut concat of independently normalised inputs, so
    // the split is mechanical: render each input with the same filters into its
    // own file (carrying its own audio), then concat with audio.
    //
    // The risk is frame rounding. One continuous timeline does not round;
    // independent segments do. The captured baseline (993 frames, 33.113991 s,
    // docs/operations/renderer-refactor-baseline.md) is what decides whether this
    // path is frame-transparent. A one-frame delta means it is not.
    let segmentAssembled: string | null = null;
    if (process.env.RENDER_SEGMENTS_ENABLED === 'true') {
      if (nativeSources.length !== inputs.length) {
        // Mixed audio would need silent tracks synthesised per segment. Fall back
        // rather than change the audio contract inside a renderer refactor.
        console.warn(
          `[export.segments] falling back to the single-graph path: ${nativeSources.length}/${inputs.length} inputs carry audio`,
        );
      } else {
        const segFiles: string[] = [];
        for (let i = 0; i < inputs.length; i += 1) {
          const segPath = path.join(dir, `seg-${i}.mp4`);
          await doFfmpeg([
            '-i', inputs[i]!,
            '-filter_complex',
              `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v];`
              + '[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]',
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            segPath,
          ]);
          const segProbe = await doProbe(segPath).catch(() => ({ durationSeconds: null }) as MediaProbe);
          console.info(`[export.segments] seg=${i} duration=${segProbe.durationSeconds ?? 'null'}`);
          segFiles.push(segPath);
        }
        const assembled = path.join(dir, 'out.mp4');
        const segLabels = segFiles.map((_, i) => `[${i}:v][${i}:a]`).join('');
        await doFfmpeg([
          ...segFiles.flatMap((file) => ['-i', file]),
          '-filter_complex', `${segLabels}concat=n=${segFiles.length}:v=1:a=1[vout][aout]`,
          '-map', '[vout]',
          '-map', '[aout]',
          '-t', String(input.derivation.effectiveDurationSeconds),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          assembled,
        ]);
        segmentAssembled = assembled;
        console.info(`[export.segments] assembled n=${segFiles.length}`);
      }
    }

    let withAudio: string;
    if (segmentAssembled) {
      // Segments already carry their source audio, so the native-audio mux would
      // duplicate it.
      withAudio = segmentAssembled;
    } else {
      const out = path.join(dir, 'out.mp4');
      const args = [
        ...inputs.flatMap((file) => ['-i', file]),
        '-filter_complex', filter,
        '-map', '[vout]',
        '-t', String(input.derivation.effectiveDurationSeconds),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        out,
      ];
      await doFfmpeg(args);

      // E1 — carry the source clips' native audio into the export before the end card.
      withAudio = await muxNativeAudioBed({
        videoPath: out,
        nativeSources,
        outputPath: path.join(dir, 'out-with-native.mp4'),
        dir,
        run: doFfmpeg,
        hasExistingAudio: false,
      });
    }

    // Append the end card so the cached derivative (keyed by source hash) always
    // includes it — a same-source re-export reuses the row and never double-applies.
    const card = await appendEndCard(withAudio, segmentAssembled ? true : nativeSources.length > 0, input.derivation.effectiveDurationSeconds);
    const buffer = await readFile(card.path);
    const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${card.path}`;
    console.info(`[export.endcard] applied=${card.applied} reason=${card.reason} exportId=${input.exportId ?? 'unknown'}`);
    // Same measurement at the non-early-return exit.
    const measured = await doProbe(card.path).catch(() => ({ durationSeconds: null }));
    return { assetUrl, endCardApplied: card.applied, durationSeconds: measured.durationSeconds };
  } finally {
    if (process.env.KEEP_EXPORT_TMP === '1') {
      console.info(`[export.concat] KEEP_EXPORT_TMP=1 - leaving temp dir ${dir}`);
    } else {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}