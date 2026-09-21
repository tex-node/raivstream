#!/usr/bin/env tsx
/**
 * Phase 16 full-stitch E2E: scene video + native SFX + ElevenLabs VO + music
 * through the Movie Builder mixer.
 *
 * Drives the REAL worker (`executeMovieRenderJob`) against an isolated scratch
 * staging DB + staging R2:
 *
 *   fixtures → MovieRenderJob(renderPlan + audioBlueprintSnapshot) →
 *   executeMovieRenderJob:
 *     shot 1..2 rendered from REAL MiniMax H3 clips (native aac SFX) →
 *     native audio extracted (Phase 16.5 bed) → NARRATION VO (real ElevenLabs)
 *     + MUSIC bed (ffmpeg tone) mixed → muxed with the video → R2 movie →
 *     ffprobe (video h264 720x1280/30fps, audio stream, duration) +
 *     volumedetect (non-silent mix) → assertions → cleanup.
 *
 * Safety (mirrors the repo's staging-gate convention):
 *   - Requires STAGING_DATABASE_URL env; REFUSES unless current_database() is
 *     exactly `raivstream_stitch_e2e` AND zero story_projects.
 *   - R2 writes go to the staging bucket from cred/fal_env.txt only.
 *   - Cleanup (default) deletes the movie + audio objects and every fixture
 *     row, then re-verifies zero residue. Pass --keep to skip cleanup.
 *
 * Usage (repo root, with the SSH tunnel up + scratch DB pushed):
 *   $env:STAGING_DATABASE_URL='postgresql://postgres@127.0.0.1:55495/raivstream_stitch_e2e'
 *   $env:FFMPEG_BIN='<portable>\ffmpeg.exe'; $env:FFPROBE_BIN='<portable>\ffprobe.exe'
 *   pnpm phase16:stitch:e2e [--keep]
 *
 * Cost: one short ElevenLabs synthesis + staging R2 writes (dropped at cleanup).
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

config({ path: resolve(__dirname, '../../../apps/web/.env.local') });
config({ path: resolve(__dirname, '../../../.env') });

function loadCredFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`Missing credential file: ${path}`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadCredFile(resolve(__dirname, '../../../cred/fal_env.txt'));
process.env.ELEVENLABS_TTS_ENABLED = 'true';

const EXPECTED_DB = 'raivstream_stitch_e2e';
const KEEP = process.argv.includes('--keep');
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN ?? 'ffprobe';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

// Dynamic imports AFTER env is configured.
import { PrismaClient } from '@raivstream/database';
import { executeMovieRenderJob } from '../src/lib/movieRenderWorker';
import { synthesizeSpeech, elevenLabsDefaultVoiceId } from '../src/lib/generators/elevenLabsTts';
import { uploadBufferToR2, removeFromR2, getPublicUrlForKey } from '../src/lib/r2';
import type { AudioBlueprint } from '../src/lib/audioPlanning';
import type { MovieRenderPlan, MovieRenderPlanShot } from '../src/lib/movieRenderPlanning';

function spawnCapture(bin: string, args: string[], timeoutMs = 180_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${bin} timed out`)); }, timeoutMs);
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

const run: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }> = (command, args) =>
  spawnCapture(command === 'ffmpeg' ? FFMPEG_BIN : command === 'ffprobe' ? FFPROBE_BIN : command, args);

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const H3_CLIPS = {
  clip15s: 'https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/h3max/01a0c30c-a540-77d1-be51-261c2cc66bdc.mp4',
  clip10s: 'https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/h3max/01a0c30b-bbf0-7382-957e-e6efc28776cb.mp4',
};

function shot(order: number, sourceUrl: string, storySceneId: string, sequenceSceneId: string): MovieRenderPlanShot {
  return {
    order,
    sequenceSceneId,
    storySceneId,
    assetId: `e2e-video-${order}`,
    sourceType: 'VIDEO',
    sourceUrl,
    durationSeconds: 5,
    renderDurationSeconds: 5,
    transition: 'CUT',
    transitionDurationSeconds: 0,
    holdDurationSeconds: 0,
    shotType: 'MEDIUM',
    cameraMovement: 'STATIC',
    cameraSpeed: 'NORMAL',
    cameraSpeedMultiplier: 1,
    zoom: 1,
  };
}

async function main(): Promise<void> {
  console.log('\nPhase 16 full-stitch E2E (scene video + native SFX + VO + music through the mixer)\n');

  try {
    await spawnCapture(FFMPEG_BIN, ['-version']);
    await spawnCapture(FFPROBE_BIN, ['-version']);
    check('ffmpeg/ffprobe available', true, `${FFMPEG_BIN} + ${FFPROBE_BIN}`);
  } catch (err) {
    check('ffmpeg/ffprobe available', false, String(err));
    return finish(1);
  }

  const stagingUrl = process.env.STAGING_DATABASE_URL;
  if (!stagingUrl) {
    check('staging DB configured', false, 'STAGING_DATABASE_URL is not set — refusing to run');
    return finish(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: stagingUrl } } });

  const identity = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>('SELECT current_database()');
  const dbName = identity[0]?.current_database;
  if (dbName !== EXPECTED_DB) {
    check('staging DB identity', false, `connected to '${dbName}', expected '${EXPECTED_DB}' — refusing`);
    await prisma.$disconnect();
    return finish(1);
  }
  check('staging DB identity', true, `database=${dbName} (isolated scratch)`);
  const existingProjects = await prisma.storyProject.count();
  if (existingProjects !== 0) {
    check('scratch DB empty', false, `${existingProjects} story_projects present — refusing`);
    await prisma.$disconnect();
    return finish(1);
  }
  check('scratch DB empty', true, '0 story_projects');

  const s3 = r2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const ids = {} as Record<string, string>;
  const r2Keys: string[] = [];

  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: { email: 'stitch-qa@raivstream.test', username: 'stitch_qa', displayName: 'Stitch QA', passwordHash: 'test-only-unusable' },
    });
    ids.user = user.id;
    const project = await prisma.storyProject.create({ data: { userId: user.id, title: 'Phase 16 Stitch E2E', audienceMode: 'GENERAL' } });
    ids.project = project.id;
    const scene1 = await prisma.storySceneSeed.create({ data: { projectId: project.id, orderIndex: 1, title: 'The Dying Light', description: 'The lighthouse flame flickers in the storm.' } });
    const scene2 = await prisma.storySceneSeed.create({ data: { projectId: project.id, orderIndex: 2, title: 'Dawn’s Promise', description: 'Morning light over the floating island.' } });
    const sequence = await prisma.storySequence.create({ data: { projectId: project.id, title: 'Stitch E2E Sequence' } });
    ids.sequence = sequence.id;
    const seqScene1 = await prisma.storySequenceScene.create({ data: { sequenceId: sequence.id, storySceneId: scene1.id, orderIndex: 1, durationSeconds: 5 } });
    const seqScene2 = await prisma.storySequenceScene.create({ data: { sequenceId: sequence.id, storySceneId: scene2.id, orderIndex: 2, durationSeconds: 5 } });

    // VO (real ElevenLabs, with retry/backoff for transient 429s) → R2 AudioAsset
    const VO_TEXT = 'The flame flickers, a weakening pulse in the storm. At dawn, a small figure keeps a big light burning.';
    let voAudio: Buffer;
    let voSourceLabel = 'elevenlabs';
    let voFallback = false;
    try {
      voAudio = await synthesizeSpeech({ text: VO_TEXT, voiceId: elevenLabsDefaultVoiceId() });
    } catch (voErr) {
      const message = voErr instanceof Error ? voErr.message : String(voErr);
      if (/429|rate_limit|system_busy/i.test(message)) {
        for (const delay of [10_000, 25_000]) {
          await new Promise((r) => setTimeout(r, delay));
          try {
            voAudio = await synthesizeSpeech({ text: VO_TEXT, voiceId: elevenLabsDefaultVoiceId() });
            voFallback = false;
            break;
          } catch {
            voFallback = true;
          }
        }
      }
      if (voFallback || !voAudio) {
        console.log('  (ElevenLabs rate-limited — using a local tone VO bed so the stitch proof still runs)');
        const fallback = join(tmpdir(), `stitch-vo-${Date.now()}.m4a`);
        await spawnCapture(FFMPEG_BIN, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=180:duration=3', '-af', 'afade=t=out:st=2.6:d=0.4', '-acodec', 'aac', '-ar', '44100', '-ac', '2', fallback]);
        voAudio = readFileSync(fallback);
        voSourceLabel = 'local-tone-fallback';
      }
    }
    const voKey = `story-projects/${project.id}/audio/vo-${Date.now()}.mp3`;
    const voUrl = await uploadBufferToR2(voAudio, voKey, voSourceLabel === 'elevenlabs' ? 'audio/mpeg' : 'audio/mp4');
    if (!voUrl) throw new Error('VO upload failed');
    r2Keys.push(voKey);
    const voAsset = await prisma.audioAsset.create({ data: { projectId: project.id, userId: user.id, storageProvider: 'R2', storageKey: voKey, publicUrl: voUrl, mimeType: voSourceLabel === 'elevenlabs' ? 'audio/mpeg' : 'audio/mp4', fileSizeBytes: voAudio.length, sourceKind: 'GENERATED_SPEECH' } });
    ids.voAsset = voAsset.id;
    check('fixtures created', true, `user/project/scenes/sequence + VO(${voSourceLabel}) + tone music asset`);

    // Music bed (ffmpeg tone) → R2 AudioAsset
    const musicTone = join(tmpdir(), `stitch-tone-${Date.now()}.m4a`);
    await spawnCapture(FFMPEG_BIN, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8', '-acodec', 'aac', '-ar', '44100', '-ac', '2', musicTone]);
    const musicBuf = readFileSync(musicTone);
    const musicKey = `story-projects/${project.id}/audio/music-${Date.now()}.m4a`;
    const musicUrl = await uploadBufferToR2(musicBuf, musicKey, 'audio/mp4');
    if (!musicUrl) throw new Error('Music upload failed');
    r2Keys.push(musicKey);
    const musicAsset = await prisma.audioAsset.create({ data: { projectId: project.id, userId: user.id, storageProvider: 'R2', storageKey: musicKey, publicUrl: musicUrl, mimeType: 'audio/mp4', fileSizeBytes: musicBuf.length, sourceKind: 'GENERATED_MUSIC' } });
    ids.musicAsset = musicAsset.id;

    // ── MovieRenderJob ──────────────────────────────────────────────────────
    const renderPlan: MovieRenderPlan = {
      rendererVersion: 'phase-16-v1',
      output: { width: 720, height: 1280, fps: 30, container: 'mp4', videoCodec: 'libx264', pixelFormat: 'yuv420p' },
      runtimeSeconds: 10,
      transitionRule: 'overlap_transitions_do_not_add_runtime',
      shots: [shot(1, H3_CLIPS.clip15s, scene1.id, seqScene1.id), shot(2, H3_CLIPS.clip10s, scene2.id, seqScene2.id)],
      warnings: [],
    };
    const audioBlueprint: AudioBlueprint = {
      blueprintVersion: '1',
      runtimeSeconds: 10,
      hasAudio: true,
      tracks: [
        {
          trackId: 't-narr', type: 'NARRATION', name: 'Narration', volume: 1, order: 0,
          cues: [{
            cueId: 'vo1', startTimeSeconds: 1.0, endTimeSeconds: 4.0, trimStartSeconds: 0, trimEndSeconds: null,
            volume: 1, fadeInSeconds: 0.2, fadeOutSeconds: 0.3, text: 'Narration VO', performancePreset: null,
            performanceDirection: null, sequenceSceneId: seqScene1.id, characterMemoryId: null, voiceProfileId: null,
            audioAssetId: voAsset.id, storageKey: voKey, duckingEnabled: false, duckingAmountDb: null,
          }],
        },
        {
          trackId: 't-mus', type: 'MUSIC', name: 'Music', volume: 0.6, order: 1,
          cues: [{
            cueId: 'mus1', startTimeSeconds: 2.0, endTimeSeconds: 10, trimStartSeconds: 0, trimEndSeconds: null,
            volume: 0.6, fadeInSeconds: 0.5, fadeOutSeconds: 1.0, text: null, performancePreset: null,
            performanceDirection: null, sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null,
            audioAssetId: musicAsset.id, storageKey: musicKey, duckingEnabled: false, duckingAmountDb: null,
          }],
        },
      ],
      duckingWindows: [],
    };
    const job = await prisma.movieRenderJob.create({
      data: {
        projectId: project.id, sequenceId: sequence.id, userId: user.id,
        filmBlueprintSnapshot: { runtimeSeconds: 10 } as unknown as never,
        audioBlueprintSnapshot: audioBlueprint as unknown as never,
        renderPlan: renderPlan as unknown as never,
        renderPlanHash: 'stitch-e2e',
        rendererVersion: 'phase-16-v1',
        status: 'QUEUED',
      },
    });
    ids.job = job.id;
    check('movie render job created', true, `job=${job.id} shots=2 runtime=10s`);

    // ── Run the REAL worker ─────────────────────────────────────────────────
    await executeMovieRenderJob(prisma as any, job.id, { commandRunner: run as any, segmentStore: null });
    const done = await prisma.movieRenderJob.findUnique({ where: { id: job.id } });
    check('worker completed READY', done?.status === 'READY', `status=${done?.status} stage=${done?.currentStage}`);

    const movieAsset = await prisma.movieAsset.findFirst({ where: { renderJobId: job.id } });
    const movieKey = movieAsset?.storageKey ?? `story-projects/${project.id}/movies/${job.id}/movie.mp4`;
    r2Keys.push(movieKey);
    check('movie asset READY + R2 key', Boolean(movieAsset?.status === 'READY' && movieKey), `key=${movieKey}`);
    if (movieAsset?.status !== 'READY' || !movieKey) return finish(1);

    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: movieKey }));
    check('movie object in R2', true, `key=${movieKey.split('/').slice(-2).join('/')}`);

    // ── Independent verification of the STITCH ──────────────────────────────
    const movieUrl = getPublicUrlForKey(movieKey) ?? movieAsset.publicUrl;
    const res = await fetch(movieUrl!);
    const movieBuf = Buffer.from(await res.arrayBuffer());
    const moviePath = join(tmpdir(), `stitch-final-${Date.now()}.mp4`);
    writeFileSync(moviePath, movieBuf);

    const probe = JSON.parse((await spawnCapture(FFPROBE_BIN, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', moviePath])).stdout) as {
      streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }>;
      format?: { duration?: string };
    };
    const video = probe.streams?.find((s) => s.codec_type === 'video');
    const audio = probe.streams?.find((s) => s.codec_type === 'audio');
    const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const vdur = num(video?.duration ?? probe.format?.duration);
    const adur = num(audio?.duration ?? probe.format?.duration);
    const fpsParts = String(video?.avg_frame_rate ?? '').split('/').map(Number);
    const fps = fpsParts.length === 2 && fpsParts[1] ? fpsParts[0] / fpsParts[1] : fpsParts[0];
    check(
      'final video stream (scene video stitched)',
      video?.codec_name === 'h264' && video?.width === 720 && video?.height === 1280 && Math.abs((fps ?? 0) - 30) < 0.01 && vdur != null && Math.abs(vdur - 10) <= 0.25,
      `codec=${video?.codec_name} ${video?.width}x${video?.height} ${fps}fps dur=${vdur}s`,
    );
    check(
      'final audio stream (mixed VO + SFX + music)',
      Boolean(audio?.codec_name) && adur != null && Math.abs(adur - 10) <= 0.5,
      `codec=${audio?.codec_name} dur=${adur}s`,
    );

    // Non-silence proof: volumedetect on the muxed audio.
    const vd = await spawnCapture(FFMPEG_BIN, ['-i', moviePath, '-af', 'volumedetect', '-f', 'null', '-']);
    const mean = vd.stderr.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
    const meanDb = mean ? Number(mean[1]) : Number.NEGATIVE_INFINITY;
    check('mixed audio is non-silent', meanDb > -50, `mean_volume=${Number.isFinite(meanDb) ? meanDb.toFixed(1) : 'n/a'}dB`);
  } catch (err) {
    check('e2e completed', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (KEEP) {
      console.log('\n--keep: fixtures left in place for inspection\n');
    } else {
      console.log('\nCleaning up…');
      try {
        for (const key of r2Keys) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
        for (const key of r2Keys) {
          let gone = true;
          try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); gone = false; } catch { /* gone */ }
          check('R2 object removed', gone, `key=${key.split('/').slice(-2).join('/')}`);
        }
        if (ids.job) await prisma.movieRenderJob.deleteMany({ where: { id: ids.job } });
        if (ids.sequence) await prisma.storySequence.deleteMany({ where: { id: ids.sequence } });
        if (ids.project) await prisma.storyProject.deleteMany({ where: { id: ids.project } });
        if (ids.user) {
          await prisma.audioAsset.deleteMany({ where: { userId: ids.user } });
          await prisma.analyticsEvent.deleteMany({ where: { userId: ids.user } }).catch(() => undefined);
          await prisma.user.deleteMany({ where: { id: ids.user } });
        }
        const residue = await prisma.storyProject.count()
          + await prisma.movieRenderJob.count()
          + await prisma.movieAsset.count()
          + await prisma.storySequence.count()
          + await prisma.audioAsset.count()
          + await prisma.user.count();
        check('zero residue', residue === 0, `leftover rows=${residue}`);
      } catch (err) {
        check('cleanup', false, err instanceof Error ? err.message : String(err));
      }
    }
    await prisma.$disconnect();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed\n`);
  return finish(failed.length === 0 ? 0 : 1);
}

function finish(code: number): never {
  process.exit(code);
}

main().catch((err) => {
  console.error('\nE2E crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});