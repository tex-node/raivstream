import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@raivstream/database';
import { refundCredits } from './credits';
import {
  MOVIE_RENDER_DURATION_TOLERANCE_SECONDS,
  MOVIE_RENDER_FEATURE_KEY,
  calculateExpectedRenderDuration,
  durationWithinTolerance,
  isOverlappingRenderedTransition,
  type MovieRenderPlan,
  type MovieRenderPlanShot,
} from './movieRenderPlanning';
import { getPublicUrlForKey, objectExistsInR2, removeFromR2, uploadBufferToR2 } from './r2';
import { assertAudioReadyGate, buildMixedAudioTrack, muxAudioWithVideo, normalizeAudioInput, probeAudioAsset, probeAudioStream, type ResolvedCueSource } from './audioMixing';
import type { AudioBlueprint, AudioBlueprintCue } from './audioPlanning';
import { analytics } from './analytics';

const FINAL_STATUSES = new Set(['READY', 'FAILED', 'CANCELLED']);

type CommandResult = void | { stdout?: string; stderr?: string };
type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type MovieRenderSegmentStore = {
  has(key: string): Promise<boolean>;
  download(key: string, filePath: string): Promise<void>;
  upload(filePath: string, key: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type MovieRenderWorkerOptions = {
  commandRunner?: CommandRunner;
  uploadMovie?: (buffer: Buffer, key: string) => Promise<string | null>;
  keepTempFiles?: boolean;
  /** Per-shot segment persistence for resume-after-failure (Phase 10). */
  segmentStore?: MovieRenderSegmentStore | null;
};

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeoutMs = Number(process.env.MOVIE_RENDER_COMMAND_TIMEOUT_MS ?? 300000);
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    // Cap total stderr so a noisy render can't exhaust memory, but keep far
    // more than the old 4 KB tail — ffmpeg's banner alone is ~20 lines, and a
    // useful error line is frequently buried behind it.
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 200000) stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const tail = stderr.slice(-20000);
        const commandLine = [command, ...args].join(' ');
        console.error(`[movieRenderWorker] ${command} exited with ${code}\n  command: ${commandLine}\n  stderr tail:\n${tail}`);
        reject(new Error(`${command} exited with ${code}\ncommand: ${commandLine}\nstderr:\n${tail}`));
      }
    });
  });
}

async function addRenderEvent(prisma: PrismaClient, jobId: string, input: {
  eventName: string;
  stage?: string;
  progressPercent?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await (prisma as any).movieRenderEvent.create({
    data: {
      renderJobId: jobId,
      eventName: input.eventName,
      stage: input.stage ?? null,
      progressPercent: input.progressPercent ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

async function updateStage(prisma: PrismaClient, jobId: string, status: string, stage: string, progressPercent: number, message?: string) {
  await (prisma as any).movieRenderJob.update({
    where: { id: jobId },
    data: { status, currentStage: stage, progressPercent },
  });
  await addRenderEvent(prisma, jobId, {
    eventName: 'movie_render_progress',
    stage,
    progressPercent,
    message,
  });
}

async function downloadToFile(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download render source (${response.status})`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

/**
 * Default R2-backed segment store. Disabled (returns null → every attempt
 * re-renders from scratch) when `MOVIE_RENDER_SEGMENT_RESUME=false` or R2 is
 * not configured, so tests/dev without storage keep the original behavior.
 */
function createR2SegmentStore(): MovieRenderSegmentStore | null {
  if (process.env.MOVIE_RENDER_SEGMENT_RESUME === 'false') return null;
  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) return null;
  return {
    has: (key) => objectExistsInR2(key),
    download: async (key, filePath) => {
      const url = getPublicUrlForKey(key);
      if (!url) throw new Error('segment URL unavailable');
      await downloadToFile(url, filePath);
    },
    upload: async (filePath, key) => {
      const buffer = await readFile(filePath);
      const stored = await uploadBufferToR2(buffer, key, 'video/mp4');
      if (!stored) throw new Error('segment upload failed');
    },
    remove: (key) => removeFromR2(key),
  };
}

async function renderShotWithRetry(inputPath: string, outputPath: string, shot: MovieRenderPlanShot, plan: MovieRenderPlan, run: CommandRunner, attempts: number) {
  const maxAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await renderShot(inputPath, outputPath, shot, plan, run);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Shot render failed');
}

function cameraFilter(shot: MovieRenderPlanShot, frames: number, width: number, height: number) {
  const movement = (shot.cameraMovement || 'STATIC').toUpperCase();
  const wideWidth = Math.ceil((width * 1.12) / 2) * 2;
  const tallHeight = Math.ceil((height * 1.12) / 2) * 2;
  const wideScale = `scale=${wideWidth}:${height}:force_original_aspect_ratio=increase`;
  const tallScale = `scale=${width}:${tallHeight}:force_original_aspect_ratio=increase`;
  const safeFrames = Math.max(1, frames - 1);
  if (movement === 'PAN_RIGHT' || movement === 'TRACK_RIGHT') {
    return `${wideScale},crop=${width}:${height}:x='(iw-${width})*n/${safeFrames}':y='(ih-${height})/2',setsar=1,fps=30`;
  }
  if (movement === 'PAN_LEFT' || movement === 'TRACK_LEFT') {
    return `${wideScale},crop=${width}:${height}:x='(iw-${width})*(1-n/${safeFrames})':y='(ih-${height})/2',setsar=1,fps=30`;
  }
  if (movement === 'TILT_UP' || movement === 'CRANE') {
    return `${tallScale},crop=${width}:${height}:x='(iw-${width})/2':y='(ih-${height})*(1-n/${safeFrames})',setsar=1,fps=30`;
  }
  if (movement === 'TILT_DOWN') {
    return `${tallScale},crop=${width}:${height}:x='(iw-${width})/2':y='(ih-${height})*n/${safeFrames}',setsar=1,fps=30`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30`;
}

function fadeFilter(shot: MovieRenderPlanShot, frames: number, width: number, height: number) {
  const base = cameraFilter(shot, frames, width, height);
  const duration = shot.transitionDurationSeconds || 0;
  if (duration <= 0) return base;
  if (shot.transition === 'DIP_TO_BLACK') return `${base},fade=t=out:st=${Math.max(0, shot.renderDurationSeconds - duration)}:d=${duration}:color=black`;
  if (shot.transition === 'DIP_TO_WHITE') return `${base},fade=t=out:st=${Math.max(0, shot.renderDurationSeconds - duration)}:d=${duration}:color=white`;
  return base;
}

function transitionName(transition: string) {
  if (transition === 'DIP_TO_BLACK') return 'fadeblack';
  if (transition === 'DIP_TO_WHITE') return 'fadewhite';
  if (transition === 'FADE' || transition === 'CROSS_DISSOLVE') return 'fade';
  return null;
}

async function renderShot(inputPath: string, outputPath: string, shot: MovieRenderPlanShot, plan: MovieRenderPlan, run: CommandRunner) {
  // Legacy plans (pre-Phase 10) have no sourceType — treat as IMAGE.
  if (shot.sourceType === 'VIDEO') {
    await renderVideoShot(inputPath, outputPath, shot, plan, run);
    return;
  }
  const frames = Math.max(1, Math.round(shot.renderDurationSeconds * plan.output.fps));
  await run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-framerate',
    String(plan.output.fps),
    '-i',
    inputPath,
    '-vf',
    fadeFilter(shot, frames, plan.output.width, plan.output.height),
    '-frames:v',
    String(frames),
    '-an',
    '-c:v',
    plan.output.videoCodec,
    '-preset',
    'ultrafast',
    '-pix_fmt',
    plan.output.pixelFormat,
    outputPath,
  ]);
}

/**
 * Render a scene-video shot (Phase 10): scale/crop the clip to the output,
 * loop it if shorter than the shot duration, trim to the exact segment length
 * (incl. transition handle), and strip audio (the movie's audio is mixed
 * separately). Camera-movement filters are intentionally NOT applied — the clip
 * already carries motion.
 */
async function renderVideoShot(inputPath: string, outputPath: string, shot: MovieRenderPlanShot, plan: MovieRenderPlan, run: CommandRunner) {
  const duration = Math.max(0.5, shot.renderDurationSeconds);
  const base = `scale=${plan.output.width}:${plan.output.height}:force_original_aspect_ratio=increase,crop=${plan.output.width}:${plan.output.height},setsar=1,fps=${plan.output.fps}`;
  const dipped = shot.transitionDurationSeconds > 0
    && (shot.transition === 'DIP_TO_BLACK' || shot.transition === 'DIP_TO_WHITE');
  const filter = dipped
    ? `${base},fade=t=out:st=${Math.max(0, duration - shot.transitionDurationSeconds)}:d=${shot.transitionDurationSeconds}:color=${shot.transition === 'DIP_TO_WHITE' ? 'white' : 'black'}`
    : base;
  await run('ffmpeg', [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    inputPath,
    '-t',
    duration.toFixed(3),
    '-vf',
    filter,
    '-an',
    '-c:v',
    plan.output.videoCodec,
    '-preset',
    'ultrafast',
    '-pix_fmt',
    plan.output.pixelFormat,
    '-r',
    String(plan.output.fps),
    outputPath,
  ]);
}

/**
 * Phase 16.5 — extract a scene clip's NATIVE audio (MiniMax H3 synchronized
 * SFX) into a canonical PCM bed so the final mix can keep it alongside the
 * narration/music cues. Loops the clip's audio to the shot's render duration
 * (matching renderVideoShot) and writes stereo 44.1kHz PCM.
 */
async function extractNativeAudio(inputPath: string, outputPath: string, durationSeconds: number, run: CommandRunner) {
  await run('ffmpeg', [
    '-y',
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

async function assembleMovie(segmentPaths: string[], outputPath: string, plan: MovieRenderPlan, run: CommandRunner) {
  if (segmentPaths.length === 1) {
    await run('ffmpeg', ['-y', '-i', segmentPaths[0], '-an', '-c:v', plan.output.videoCodec, '-preset', 'ultrafast', '-pix_fmt', plan.output.pixelFormat, '-movflags', '+faststart', outputPath]);
    return;
  }

  const args = ['-y'];
  for (const segmentPath of segmentPaths) args.push('-i', segmentPath);

  let filter = '';
  for (let index = 0; index < segmentPaths.length; index += 1) {
    filter += `[${index}:v]setpts=PTS-STARTPTS,fps=${plan.output.fps},format=${plan.output.pixelFormat},setsar=1[s${index}];`;
  }
  let currentLabel = '[s0]';
  let assembledDurationSeconds = plan.shots[0]?.durationSeconds ?? 0;
  let outputLabel = '';

  for (let index = 1; index < segmentPaths.length; index += 1) {
    const shot = plan.shots[index];
    const xfade = transitionName(shot.transition);
    outputLabel = `[v${index}]`;
    if (xfade && shot.transitionDurationSeconds > 0) {
      const offset = Math.max(0, assembledDurationSeconds - shot.transitionDurationSeconds);
      filter += `${currentLabel}[s${index}]xfade=transition=${xfade}:duration=${shot.transitionDurationSeconds}:offset=${offset.toFixed(3)}${outputLabel};`;
    } else {
      filter += `${currentLabel}[s${index}]concat=n=2:v=1:a=0${outputLabel};`;
    }
    currentLabel = outputLabel;
    assembledDurationSeconds += shot.durationSeconds;
  }

  args.push(
    '-filter_complex',
    filter.replace(/;$/, ''),
    '-map',
    outputLabel,
    '-an',
    '-c:v',
    plan.output.videoCodec,
    '-preset',
    'ultrafast',
    '-pix_fmt',
    plan.output.pixelFormat,
    '-movflags',
    '+faststart',
    outputPath,
  );
  await run('ffmpeg', args);
}

type MovieProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  container: string;
  fileSizeBytes: number;
};

function parseFps(value: string | undefined) {
  if (!value) return 0;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!Number.isFinite(numerator)) return 0;
  if (!denominator) return numerator;
  return denominator === 0 ? 0 : numerator / denominator;
}

async function inputHasVideoStream(filePath: string, run: CommandRunner): Promise<boolean> {
  try {
    const result = await run('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'json',
      filePath,
    ]);
    const raw = result && typeof result === 'object' && 'stdout' in result ? result.stdout ?? '' : '';
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed.streams?.[0]?.codec_type === 'video';
  } catch {
    return false;
  }
}

async function probeMovie(filePath: string, run: CommandRunner): Promise<MovieProbe> {
  const result = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,avg_frame_rate,duration',
    '-show_entries',
    'format=duration,size,format_name',
    '-of',
    'json',
    filePath,
  ]);
  const raw = result && typeof result === 'object' && 'stdout' in result ? result.stdout ?? '' : '';
  const parsed = raw ? JSON.parse(raw) : {};
  const stream = parsed.streams?.[0];
  const format = parsed.format ?? {};
  if (!stream) throw new Error('OUTPUT_VERIFICATION_FAILED: no video stream found');
  const durationSeconds = Number(stream.duration ?? format.duration);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const fps = parseFps(stream.avg_frame_rate);
  const fileSizeBytes = Number(format.size);
  const codec = String(stream.codec_name ?? '');
  const container = String(format.format_name ?? '');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('OUTPUT_VERIFICATION_FAILED: invalid duration');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('OUTPUT_VERIFICATION_FAILED: invalid dimensions');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('OUTPUT_VERIFICATION_FAILED: invalid frame rate');
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) throw new Error('OUTPUT_VERIFICATION_FAILED: empty output');
  return { durationSeconds, width, height, fps, codec, container, fileSizeBytes };
}

// Ordered, prefix-matched typed error codes. Every throw site in this file
// that wants a specific diagnostic code prefixes its message with exactly
// one of these; anything else falls back to the generic MOVIE_RENDER_FAILED.
// More specific prefixes (e.g. OUTPUT_AUDIO_STREAM_MISSING) are listed
// before their more general relatives (OUTPUT_VERIFICATION_FAILED) so a
// specific match is never shadowed by a broader one.
const KNOWN_RENDER_ERROR_CODE_PREFIXES = [
  'OUTPUT_DURATION_MISMATCH',
  'OUTPUT_AUDIO_STREAM_MISSING',
  'OUTPUT_AUDIO_VERIFICATION_FAILED',
  'AUDIO_ASSET_NOT_FOUND',
  'AUDIO_ASSET_PROJECT_MISMATCH',
  'AUDIO_ASSET_STORAGE_KEY_MISSING',
  'AUDIO_ASSET_STORAGE_KEY_MISMATCH',
  'AUDIO_ASSET_PROBE_FAILED',
  'MOVIE_RENDER_INPUT_INVALID',
  'OUTPUT_VERIFICATION_FAILED',
] as const;

async function failJob(prisma: PrismaClient, job: any, error: unknown, metadata?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = KNOWN_RENDER_ERROR_CODE_PREFIXES.find((prefix) => message.startsWith(prefix)) ?? 'MOVIE_RENDER_FAILED';
  await (prisma as any).movieRenderJob.update({
    where: { id: job.id },
    data: {
      status: 'FAILED',
      currentStage: 'failed',
      progressPercent: 100,
      failedAt: new Date(),
      errorCode,
      errorMessage: message.slice(0, 1000),
    },
  });
  await addRenderEvent(prisma, job.id, {
    eventName: 'movie_render_failed',
    stage: 'failed',
    progressPercent: 100,
    message: message.slice(0, 1000),
    metadata,
  });
  if (job.creditsCharged > 0) {
    await refundCredits(prisma, job.userId, job.creditsCharged, MOVIE_RENDER_FEATURE_KEY, job.id, 'Movie render failed');
    await (prisma as any).movieRenderJob.update({
      where: { id: job.id },
      data: { creditsReserved: 0, creditsCharged: 0 },
    });
  }
}

export async function executeMovieRenderJob(
  prisma: PrismaClient,
  jobId: string,
  options: MovieRenderWorkerOptions = {},
) {
  const run = options.commandRunner ?? runCommand;
  const uploadMovie = options.uploadMovie ?? ((buffer: Buffer, key: string) => uploadBufferToR2(buffer, key, 'video/mp4'));
  const segmentStore = options.segmentStore === undefined ? createR2SegmentStore() : options.segmentStore;
  const job = await (prisma as any).movieRenderJob.findUnique({ where: { id: jobId } });
  if (!job || FINAL_STATUSES.has(job.status)) return null;

  const tempDir = path.join(os.tmpdir(), 'raivstream-movie-render', job.id);
  try {
    const plan = job.renderPlan as MovieRenderPlan;
    const expectedDurationSeconds = calculateExpectedRenderDuration(plan.shots);
    await mkdir(tempDir, { recursive: true });
    await (prisma as any).movieRenderJob.update({
      where: { id: job.id },
      data: { status: 'PREPARING', startedAt: new Date(), attemptCount: { increment: 1 }, currentStage: 'preparing', progressPercent: 5 },
    });
    await addRenderEvent(prisma, job.id, { eventName: 'movie_render_started', stage: 'preparing', progressPercent: 5 });

    const segmentPaths: string[] = [];
    const segmentKeys: string[] = [];
    const nativeAudioSources: Array<{ order: number; startTimeSeconds: number; durationSeconds: number; filePath: string }> = [];
    const keepNativeAudio = job.keepNativeAudio ?? (process.env.MOVIE_RENDER_KEEP_NATIVE_AUDIO ?? 'true') !== 'false';
    const shotAttempts = Number(process.env.MOVIE_RENDER_SHOT_ATTEMPTS ?? 2);
    let canonicalTimeSeconds = 0;
    for (let index = 0; index < plan.shots.length; index += 1) {
      const shot = plan.shots[index];
      const name = `shot-${String(index + 1).padStart(3, '0')}`;
      const inputPath = path.join(tempDir, `${name}.source`);
      const segmentPath = path.join(tempDir, `${name}.mp4`);
      const segmentKey = `story-projects/${job.projectId}/movies/${job.id}/segments/${name}.mp4`;
      segmentPaths.push(segmentPath);
      segmentKeys.push(segmentKey);

      // Download the source FIRST so native audio can be extracted on both the
      // render and resume paths (Phase 16.5 native-SFX bed).
      await downloadToFile(shot.sourceUrl, inputPath);

      // Pre-flight: a 0/truncated download or a video file with no video stream
      // is the classic silent ffmpeg-failure cause — catch it here with a typed
      // error instead of letting ffmpeg emit a bare exit code.
      const downloaded = await stat(inputPath).catch(() => null);
      if (!downloaded || downloaded.size <= 0) {
        throw new Error(`MOVIE_RENDER_INPUT_INVALID: shot ${index + 1} downloaded ${downloaded?.size ?? 0} bytes (${shot.sourceType})`);
      }
      if (shot.sourceType === 'VIDEO') {
        const inputProbe = await inputHasVideoStream(inputPath, run).catch(() => false);
        if (!inputProbe) {
          throw new Error(`MOVIE_RENDER_INPUT_INVALID: shot ${index + 1} video source has no decodable video stream`);
        }
      }

      // Resume: reuse a segment persisted by a prior (failed) attempt of this
      // same job, so a retry only renders the shots that never completed.
      if (segmentStore && await segmentStore.has(segmentKey).catch(() => false)) {
        await segmentStore.download(segmentKey, segmentPath);
        await addRenderEvent(prisma, job.id, {
          eventName: 'movie_render_shot_reused',
          stage: `shot_${index + 1}_reused`,
          progressPercent: 10 + Math.floor(((index + 1) / plan.shots.length) * 55),
          metadata: { order: shot.order, segmentKey },
        });
      } else {
        await updateStage(prisma, job.id, 'RENDERING_SHOTS', `rendering_shot_${index + 1}`, 10 + Math.floor((index / plan.shots.length) * 55));
        await renderShotWithRetry(inputPath, segmentPath, shot, plan, run, shotAttempts);
        if (segmentStore) {
          await segmentStore.upload(segmentPath, segmentKey).catch(() => undefined);
        }
      }

      // Phase 16.5 — preserve the scene clip's native audio (MiniMax SFX) as an
      // ambience bed in the final mix. Stills have no audio; clips without an
      // audio stream are skipped (they stay silent, as before).
      if (keepNativeAudio && shot.sourceType === 'VIDEO') {
        const sourceProbe = await probeAudioAsset(inputPath, run);
        if (sourceProbe.hasAudioStream) {
          const nativePath = path.join(tempDir, `${name}.audio.wav`);
          await extractNativeAudio(inputPath, nativePath, shot.renderDurationSeconds, run);
          nativeAudioSources.push({ order: shot.order, startTimeSeconds: canonicalTimeSeconds, durationSeconds: shot.durationSeconds, filePath: nativePath });
        }
      }
      canonicalTimeSeconds += shot.durationSeconds;
    }

    await updateStage(prisma, job.id, 'ASSEMBLING', 'assembling', 72);
    const outputPath = path.join(tempDir, 'movie.mp4');
    await assembleMovie(segmentPaths, outputPath, plan, run);

    await updateStage(prisma, job.id, 'VERIFYING', 'verifying_output', 86);
    const probe = await probeMovie(outputPath, run);
    const durationCheck = durationWithinTolerance({
      expectedSeconds: expectedDurationSeconds,
      actualSeconds: probe.durationSeconds,
      toleranceSeconds: Number(process.env.MOVIE_RENDER_DURATION_TOLERANCE_SECONDS ?? MOVIE_RENDER_DURATION_TOLERANCE_SECONDS),
    });
    if (!durationCheck.ok) {
      throw new Error(`OUTPUT_DURATION_MISMATCH: expected ${durationCheck.expectedDurationSeconds}s, actual ${durationCheck.actualDurationSeconds}s, delta ${durationCheck.durationDeltaSeconds}s`);
    }
    if (probe.width !== plan.output.width || probe.height !== plan.output.height) {
      throw new Error(`OUTPUT_VERIFICATION_FAILED: expected ${plan.output.width}x${plan.output.height}, got ${probe.width}x${probe.height}`);
    }
    if (Math.abs(probe.fps - plan.output.fps) > 0.01) {
      throw new Error(`OUTPUT_VERIFICATION_FAILED: expected ${plan.output.fps} fps, got ${probe.fps}`);
    }
    if (probe.codec !== 'h264') {
      throw new Error(`OUTPUT_VERIFICATION_FAILED: expected h264 codec, got ${probe.codec}`);
    }
    // Silent-film verification is exactly as before this point — unchanged,
    // still operating on `outputPath`/`probe`. Everything below is additive:
    // a project with no enabled audio cues never enters this branch at all
    // (required behavior: "Silent films must remain valid", tests I/M).
    let finalOutputPath = outputPath;
    let audioVerification: Record<string, unknown> | null = null;
    const audioBlueprint = job.audioBlueprintSnapshot as AudioBlueprint | null;
    // "Renderable" is stricter than the planning-level blueprint.hasAudio:
    // a NARRATION/DIALOGUE cue can exist in the creative plan with only text
    // and no attached AudioAsset yet (no TTS provider exists this phase —
    // brief §27). Only cues with a resolved audioAssetId actually contribute
    // bytes to the mix; text-only speech cues are silently excluded from the
    // render (not an error) until a future phase adds generation.
    const cuesWithSource = audioBlueprint
      ? audioBlueprint.tracks.flatMap((track) =>
          track.cues
            .filter((cue) => cue.audioAssetId)
            .map((cue) => ({ cue, trackType: track.type, trackVolume: track.volume })))
      : [];

    const hasNativeAudio = nativeAudioSources.length > 0;
    if ((audioBlueprint?.hasAudio && cuesWithSource.length > 0) || hasNativeAudio) {
      await updateStage(prisma, job.id, 'VERIFYING', 'mixing_audio', 89);

      // Every materialized cue (one that claims an audioAssetId) is resolved
      // through this exact, strict, ordered sequence. A cue with NO
      // audioAssetId at all is a different condition entirely — plain
      // speech/creative intent, handled by preflight/product semantics
      // (summarizeUnmaterializedSpeechCues) — and never reaches this loop
      // (cuesWithSource already filtered on audioAssetId presence). But once
      // a cue DOES claim one, every step below either resolves cleanly or
      // the WHOLE RENDER fails with a typed error — never a silent per-cue
      // skip. A foreign or tampered reference is a hard integrity problem,
      // not something to quietly drop and carry on past.
      //
      //   1. require audioAssetId            (cuesWithSource's own filter)
      //   2. load asset from DB              (per-cue, always a fresh,
      //                                        trusted lookup — never the
      //                                        blueprint/snapshot alone)
      //   3. require asset exists            -> AUDIO_ASSET_NOT_FOUND
      //   4. require asset.projectId matches -> AUDIO_ASSET_PROJECT_MISMATCH
      //      (checked BEFORE any fetch/download — a cross-project reference
      //      must never become a storage access side channel)
      //   5. require asset.storageKey exists -> AUDIO_ASSET_STORAGE_KEY_MISSING
      //   5.5. compare snapshot cue.storageKey (if present) against the
      //      canonical DB value -> AUDIO_ASSET_STORAGE_KEY_MISMATCH
      //      The snapshot's storageKey is PROVENANCE, never AUTHORITY —
      //      it records what this render intended to use when the job was
      //      created. It is deliberately NOT silently overridden by the DB
      //      value on a mismatch: doing that would let the actual render
      //      input differ from the immutable snapshot while the job still
      //      claims the original provenance, which undermines the whole
      //      point of an immutable A/B snapshot. A mismatch is therefore a
      //      typed, loud failure, not a quiet substitution. (A snapshot with
      //      no storageKey at all — predates this field, or the
      //      blueprint-builder never resolved one — has nothing to compare
      //      against and is not a mismatch.)
      //   6. resolve URL from the canonical DB storageKey (only after 5.5
      //      confirms it matches provenance, or there was nothing to check)
      //   7. download
      //   8. probe (raw)                     -> AUDIO_ASSET_PROBE_FAILED
      //   9. normalize
      //  10. mix (outside this loop, once, over every resolved source)
      //
      // Lifecycle assumption this whole sequence depends on: an
      // AudioAsset's storageKey is treated as IMMUTABLE for the lifetime of
      // the row — nothing in this codebase ever updates
      // AudioAsset.storageKey in place. If storage migration is ever
      // supported (re-encoding, moving buckets, etc.), it must create a new
      // asset identity/version rather than mutate the key an existing
      // snapshot already points at — otherwise a strict mismatch check here
      // would make every already-queued or retried render referencing the
      // old key permanently unrenderable. Not solved here; documented so it
      // isn't rediscovered the hard way later.
      const sources: ResolvedCueSource[] = [];
      const inputAssetProbes: Array<{ cueId: string; durationSeconds: number | null; sampleRateHz: number | null; channels: number | null }> = [];
      for (const { cue, trackType, trackVolume } of cuesWithSource) {
        const audioAssetId = cue.audioAssetId as string;

        // Step 2 + 3.
        const asset: any = await (prisma as any).audioAsset.findUnique({ where: { id: audioAssetId } });
        if (!asset) {
          throw new Error(`AUDIO_ASSET_NOT_FOUND: cue ${cue.cueId} references audioAssetId ${audioAssetId}, which does not exist.`);
        }

        // Step 4 — before anything that could touch storage.
        if (asset.projectId !== job.projectId) {
          throw new Error(`AUDIO_ASSET_PROJECT_MISMATCH: cue ${cue.cueId} references audioAssetId ${audioAssetId}, which belongs to a different project than this render job.`);
        }

        // Step 5.
        if (!asset.storageKey) {
          throw new Error(`AUDIO_ASSET_STORAGE_KEY_MISSING: cue ${cue.cueId}'s audio asset ${audioAssetId} has no storage key.`);
        }

        // Step 5.5 — provenance vs. authority. A snapshot that recorded a
        // storageKey which no longer matches the canonical DB value is a
        // typed, loud failure — never a silent substitution. Nothing to
        // compare when the snapshot has no storageKey at all (older
        // snapshots, or a cue the blueprint-builder never resolved one for).
        if (cue.storageKey && cue.storageKey !== asset.storageKey) {
          throw new Error(`AUDIO_ASSET_STORAGE_KEY_MISMATCH: cue ${cue.cueId}'s snapshot storageKey does not match audio asset ${audioAssetId}'s canonical DB storageKey.`);
        }

        // Step 6. Always the canonical DB storageKey (verified above to
        // either match the snapshot's provenance or have nothing to
        // compare) — never the snapshot's own value directly, so there is
        // exactly one code path that ever builds a fetch target. Falls back
        // to the asset's stored publicUrl only when no R2_PUBLIC_URL-derived
        // URL is available (e.g. local/test fixtures) — that fallback is
        // still a DB-trusted field, never a browser/snapshot-supplied one.
        const sourceUrl = getPublicUrlForKey(asset.storageKey) ?? asset.publicUrl;
        if (!sourceUrl) {
          throw new Error(`AUDIO_ASSET_STORAGE_KEY_MISSING: cue ${cue.cueId}'s audio asset ${audioAssetId} has a storage key that could not be resolved to a retrievable URL.`);
        }

        // Step 7.
        const rawPath = path.join(tempDir, `audio-${cue.cueId}.source`);
        await downloadToFile(sourceUrl, rawPath);

        // Step 8 — probe the RAW download before spending effort normalizing
        // it, so a corrupt/non-audio download fails fast with a clear cause.
        const rawProbe = await probeAudioAsset(rawPath, run);
        if (!rawProbe.hasAudioStream) {
          throw new Error(`AUDIO_ASSET_PROBE_FAILED: cue ${cue.cueId}'s audio asset ${audioAssetId} could not be probed, or has no audio stream.`);
        }
        inputAssetProbes.push({ cueId: cue.cueId, durationSeconds: rawProbe.durationSeconds, sampleRateHz: rawProbe.sampleRateHz, channels: rawProbe.channels });

        // Step 9. Normalize to the canonical intermediate PCM format before
        // the file ever reaches the mix filter graph (see
        // audioMixing.ts normalizeAudioInput docstring) — mixing math
        // (adelay/atrim/afade offsets) must operate on identically-shaped
        // audio regardless of what format/sample-rate the upload was in.
        const normalizedPath = path.join(tempDir, `audio-${cue.cueId}.normalized.wav`);
        await normalizeAudioInput({ inputPath: rawPath, outputPath: normalizedPath, run });

        sources.push({ cue, trackType, trackVolume, filePath: normalizedPath });
      }

      if (sources.length > 0) {
        const mixedAudioPath = path.join(tempDir, 'mixed-audio.m4a');
        // Phase 16.5 — include each scene clip's native audio (MiniMax SFX) as an
        // AMBIENCE bed at its canonical start time, alongside the plan cues.
        for (const native of nativeAudioSources) {
          sources.push({
            cue: {
              cueId: `native-sfx-${native.order}`,
              startTimeSeconds: native.startTimeSeconds,
              endTimeSeconds: native.startTimeSeconds + native.durationSeconds,
              trimStartSeconds: 0,
              trimEndSeconds: null,
              volume: 1,
              fadeInSeconds: 0,
              fadeOutSeconds: 0,
              text: null,
              performancePreset: null,
              performanceDirection: null,
              sequenceSceneId: null,
              characterMemoryId: null,
              voiceProfileId: null,
              audioAssetId: null,
              storageKey: null,
              duckingEnabled: false,
              duckingAmountDb: null,
            } as AudioBlueprintCue,
            trackType: 'AMBIENCE',
            trackVolume: 1,
            filePath: native.filePath,
          });
        }
        // canonicalRuntimeSeconds is the Audio Blueprint's own runtimeSeconds,
        // which is always copied directly from the Film Blueprint — never an
        // independently-derived value. Forcing the mix to this exact length
        // (pad/trim, see buildMixFilterGraph) is what keeps "Film Blueprint
        // runtime = Audio Blueprint runtime = final movie runtime" true
        // regardless of individual cue timing. Falls back to the render plan's
        // expected duration when a shot carries native audio but the project
        // has no audio blueprint (Phase 16.5).
        await buildMixedAudioTrack({
          sources,
          duckingWindows: audioBlueprint?.duckingWindows ?? [],
          canonicalRuntimeSeconds: audioBlueprint?.runtimeSeconds ?? expectedDurationSeconds,
          outputPath: mixedAudioPath,
          run,
        });

        const muxedPath = path.join(tempDir, 'movie-with-audio.mp4');
        await muxAudioWithVideo({ videoPath: outputPath, audioPath: mixedAudioPath, outputPath: muxedPath, run });

        const audioProbe = await probeAudioStream(muxedPath, run);
        assertAudioReadyGate({ expectedAudio: true, probe: audioProbe, expectedVideoDurationSeconds: probe.durationSeconds });

        // Second, independent leg of the same invariant: re-probe the muxed
        // file's VIDEO stream and confirm it is still within the existing
        // 0.25s tolerance of the pre-mux silent probe. `-c:v copy` never
        // re-encodes, but this catches any regression where muxing (e.g. a
        // future `-shortest`/`-t` change) truncates the video stream instead
        // of the now-exact-length audio stream.
        const postMuxVideoProbe = await probeMovie(muxedPath, run);
        const videoDurationCheck = durationWithinTolerance({
          expectedSeconds: probe.durationSeconds,
          actualSeconds: postMuxVideoProbe.durationSeconds,
        });
        if (!videoDurationCheck.ok) {
          throw new Error(`OUTPUT_DURATION_MISMATCH: muxing audio altered video duration — expected ${videoDurationCheck.expectedDurationSeconds}s, actual ${videoDurationCheck.actualDurationSeconds}s, delta ${videoDurationCheck.durationDeltaSeconds}s`);
        }

        finalOutputPath = muxedPath;
        audioVerification = { ...audioProbe, inputAssetProbes, postMuxVideoDurationSeconds: postMuxVideoProbe.durationSeconds };
      }
    }

    const buffer = await readFile(finalOutputPath);
    const file = await stat(finalOutputPath);
    if (file.size <= 0) throw new Error('OUTPUT_VERIFICATION_FAILED: invalid output size');
    if (finalOutputPath === outputPath && file.size !== probe.fileSizeBytes) {
      // Only enforced on the untouched silent-film path — the muxed file's
      // size legitimately differs from the silent probe once audio is added.
      throw new Error('OUTPUT_VERIFICATION_FAILED: invalid output size');
    }
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    await updateStage(prisma, job.id, 'UPLOADING', 'uploading_to_r2', 94);
    const nextVersion = await (prisma as any).movieAsset.count({ where: { projectId: job.projectId } }) + 1;
    const storageKey = `story-projects/${job.projectId}/movies/${job.id}/movie.mp4`;
    const publicUrl = await uploadMovie(buffer, storageKey);
    if (!publicUrl) throw new Error('R2 upload is not configured for movie renders.');

    const asset = await (prisma as any).$transaction(async (tx: any) => {
      await tx.movieAsset.updateMany({ where: { projectId: job.projectId, isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.movieAsset.create({
        data: {
          projectId: job.projectId,
          sequenceId: job.sequenceId,
          renderJobId: job.id,
          versionNumber: nextVersion,
          status: 'READY',
          storageKey,
          publicUrl,
          width: plan.output.width,
          height: plan.output.height,
          durationSeconds: plan.runtimeSeconds,
          fps: plan.output.fps,
          fileSizeBytes: file.size,
          checksum,
          isCurrent: true,
          metadata: {
            rendererVersion: plan.rendererVersion,
            renderPlanHash: job.renderPlanHash,
            shotCount: plan.shots.length,
            outputVerifiedAt: new Date().toISOString(),
            verification: {
              ...durationCheck,
              width: probe.width,
              height: probe.height,
              fps: probe.fps,
              codec: probe.codec,
              container: probe.container,
              fileSizeBytes: probe.fileSizeBytes,
            },
            hasAudio: Boolean(audioVerification),
            audioVerification,
          },
        },
      });
      await tx.movieRenderJob.update({
        where: { id: job.id },
        data: { status: 'READY', currentStage: 'ready', progressPercent: 100, completedAt: new Date() },
      });
      return created;
    });
    await addRenderEvent(prisma, job.id, { eventName: 'movie_render_completed', stage: 'ready', progressPercent: 100, metadata: { movieAssetId: asset.id, storageKey } });
    if (audioVerification) {
      await analytics.track(prisma, {
        event: 'movie_render_with_audio_completed',
        userId: job.userId,
        projectId: job.projectId,
        properties: { renderJobId: job.id, movieAssetId: asset.id },
      });
    }
    // The final movie is durable now — the per-shot resume segments are no
    // longer needed (best-effort cleanup; never fails the render).
    if (segmentStore) {
      await Promise.all(segmentKeys.map((key) => segmentStore.remove(key).catch(() => undefined)));
    }
    return asset;
  } catch (error) {
    const plan = job.renderPlan as MovieRenderPlan | undefined;
    const expectedDurationSeconds = plan?.shots ? calculateExpectedRenderDuration(plan.shots) : undefined;
    const audioBlueprintOnFailure = job.audioBlueprintSnapshot as AudioBlueprint | null;
    if (audioBlueprintOnFailure?.hasAudio) {
      await analytics.track(prisma, {
        event: 'movie_render_with_audio_failed',
        userId: job.userId,
        projectId: job.projectId,
        properties: { renderJobId: job.id, errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error) },
      });
    }
    await failJob(prisma, job, error, expectedDurationSeconds ? { expectedDurationSeconds } : undefined);
    return null;
  } finally {
    if (!options.keepTempFiles) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function queueMovieRenderJob(prisma: PrismaClient, jobId: string) {
  if (process.env.MOVIE_RENDER_WORKER_DISABLED === 'true') return;
  const enqueue = typeof setImmediate === 'function' ? setImmediate : (callback: () => void) => setTimeout(callback, 0);
  enqueue(() => {
    executeMovieRenderJob(prisma, jobId).catch((error) => {
      console.warn('[movie-render] worker crashed', jobId, error);
    });
  });
}

export async function ffmpegAvailable(commandRunner: CommandRunner = runCommand) {
  try {
    await commandRunner('ffmpeg', ['-version']);
    await commandRunner('ffprobe', ['-version']);
    return true;
  } catch {
    return false;
  }
}
