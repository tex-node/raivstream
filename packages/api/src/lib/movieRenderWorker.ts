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
import { uploadBufferToR2 } from './r2';

const FINAL_STATUSES = new Set(['READY', 'FAILED', 'CANCELLED']);

type CommandResult = void | { stdout?: string; stderr?: string };
type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type MovieRenderWorkerOptions = {
  commandRunner?: CommandRunner;
  uploadMovie?: (buffer: Buffer, key: string) => Promise<string | null>;
  keepTempFiles?: boolean;
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
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk).slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
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

async function failJob(prisma: PrismaClient, job: any, error: unknown, metadata?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = message.startsWith('OUTPUT_DURATION_MISMATCH')
    ? 'OUTPUT_DURATION_MISMATCH'
    : message.startsWith('OUTPUT_VERIFICATION_FAILED')
      ? 'OUTPUT_VERIFICATION_FAILED'
      : 'MOVIE_RENDER_FAILED';
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
    for (let index = 0; index < plan.shots.length; index += 1) {
      const shot = plan.shots[index];
      await updateStage(prisma, job.id, 'RENDERING_SHOTS', `rendering_shot_${index + 1}`, 10 + Math.floor((index / plan.shots.length) * 55));
      const inputPath = path.join(tempDir, `shot-${String(index + 1).padStart(3, '0')}.source`);
      const segmentPath = path.join(tempDir, `shot-${String(index + 1).padStart(3, '0')}.mp4`);
      await downloadToFile(shot.sourceUrl, inputPath);
      await renderShot(inputPath, segmentPath, shot, plan, run);
      segmentPaths.push(segmentPath);
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
    const buffer = await readFile(outputPath);
    const file = await stat(outputPath);
    if (file.size <= 0 || file.size !== probe.fileSizeBytes) throw new Error('OUTPUT_VERIFICATION_FAILED: invalid output size');
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
    return asset;
  } catch (error) {
    const plan = job.renderPlan as MovieRenderPlan | undefined;
    const expectedDurationSeconds = plan?.shots ? calculateExpectedRenderDuration(plan.shots) : undefined;
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
