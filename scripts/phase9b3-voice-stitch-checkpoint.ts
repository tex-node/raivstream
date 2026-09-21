#!/usr/bin/env tsx
/**
 * Phase 9B.3 voice stitching checkpoint.
 *
 * Proves a REAL ElevenLabs narration asset survives the production audio
 * pipeline end to end: input gate → normalize → mix → mux → verify.
 *
 *   1. probeAudioAsset(real ElevenLabs MP3) — the worker's input gate accepts it
 *   2. normalizeAudioInput(MP3 → canonical PCM WAV)
 *   3. buildMixedAudioTrack([narration @1s + music bed @4s], 12s canonical)
 *      → mixed track is exactly the canonical runtime (±0.25s)
 *   4. Render a silent 720x1280/30fps/12s H.264 test video (lavfi testsrc)
 *   5. muxAudioWithVideo → final.mp4
 *   6. assertAudioReadyGate + INDEPENDENT ffprobe (parsed here, not via worker
 *      helpers): video h264 720x1280 ~30fps ≈12s, audio stream present ≈12s
 *
 * Requires real `ffmpeg`/`ffprobe` on PATH (or FFMPEG_BIN/FFPROBE_BIN env) —
 * i.e. this workstation with the portable build, or the staging/production
 * VPS. No DB, no R2, no network, no credits.
 *
 * Usage (from repo root):
 *   pnpm voice:stitch:check [path/to/narration.mp3] [--keep]
 *   (defaults to the newest elevenlabs-smoke-*.mp3 in os.tmpdir())
 */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AUDIO_DURATION_TOLERANCE_SECONDS,
  assertAudioReadyGate,
  buildMixedAudioTrack,
  muxAudioWithVideo,
  normalizeAudioInput,
  probeAudioAsset,
  probeAudioStream,
  type CommandRunner,
  type ResolvedCueSource,
} from '../packages/api/src/lib/audioMixing';
import type { AudioBlueprintCue } from '../packages/api/src/lib/audioPlanning';

const RUNTIME_SECONDS = 12;
const TOLERANCE = AUDIO_DURATION_TOLERANCE_SECONDS;
const KEEP = process.argv.includes('--keep');
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN ?? 'ffprobe';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

function spawnCapture(bin: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c).slice(-2000); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr}`));
    });
  });
}

/** Runner injected into the production audio functions (same seam the worker uses). */
const run: CommandRunner = async (command: string, args: string[]) => {
  const bin = command === 'ffmpeg' ? FFMPEG_BIN : command === 'ffprobe' ? FFPROBE_BIN : command;
  return spawnCapture(bin, args);
};

function findNewestSmokeMp3(): string | null {
  const dir = tmpdir();
  const candidates = readdirSync(dir)
    .filter((f) => /^elevenlabs-smoke-.*\.mp3$/.test(f))
    .map((f) => join(dir, f))
    .sort()
    .reverse();
  return candidates[0] ?? null;
}

function cue(over: Partial<AudioBlueprintCue> & { cueId: string; startTimeSeconds: number }): AudioBlueprintCue {
  return {
    endTimeSeconds: null,
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
    ...over,
  };
}

async function main(): Promise<void> {
  console.log('\nPhase 9B.3 voice stitching checkpoint\n');

  // ── 0. Binaries + source asset ────────────────────────────────────────────
  try {
    await spawnCapture(FFMPEG_BIN, ['-version']);
    await spawnCapture(FFPROBE_BIN, ['-version']);
    check('ffmpeg/ffprobe available', true, `${FFMPEG_BIN} + ${FFPROBE_BIN}`);
  } catch (err) {
    check('ffmpeg/ffprobe available', false, String(err));
    return finish(1);
  }

  const argPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const narrationMp3 = argPath ?? findNewestSmokeMp3();
  if (!narrationMp3) {
    check('narration source', false, 'no MP3 path given and no elevenlabs-smoke-*.mp3 in tmpdir (run: pnpm elevenlabs test)');
    return finish(1);
  }
  check('narration source', true, narrationMp3);

  const workdir = await mkdtemp(join(tmpdir(), 'voice-stitch-'));
  const normMp3 = join(workdir, 'narration.norm.wav');
  const toneRaw = join(workdir, 'tone.raw.wav');
  const toneNorm = join(workdir, 'tone.norm.wav');
  const mixPath = join(workdir, 'mix.m4a');
  const silentPath = join(workdir, 'silent.mp4');
  const finalPath = join(workdir, 'final.mp4');

  try {
    // ── 1. Input gate on the REAL ElevenLabs file ───────────────────────────
    const inputProbe = await probeAudioAsset(narrationMp3, run);
    check(
      'input gate accepts ElevenLabs MP3',
      inputProbe.hasAudioStream,
      `codec=${inputProbe.codec} ${inputProbe.sampleRateHz}Hz ch=${inputProbe.channels} dur=${inputProbe.durationSeconds}s`,
    );
    if (!inputProbe.hasAudioStream) return finish(1);

    // ── 2. Normalize (MP3 → canonical PCM) ──────────────────────────────────
    await normalizeAudioInput({ inputPath: narrationMp3, outputPath: normMp3, run });
    const normProbe = await probeAudioStream(normMp3, run);
    check(
      'normalize to canonical WAV',
      normProbe.hasAudioStream && normProbe.sampleRateHz === 44100 && normProbe.channels === 2,
      `codec=${normProbe.codec} ${normProbe.sampleRateHz}Hz ch=${normProbe.channels}`,
    );

    // ── 3. Second cue source (music bed stand-in) + mix ─────────────────────
    await spawnCapture(FFMPEG_BIN, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8', '-ar', '44100', '-ac', '2', toneRaw]);
    await normalizeAudioInput({ inputPath: toneRaw, outputPath: toneNorm, run });
    const sources: ResolvedCueSource[] = [
      {
        cue: cue({ cueId: 'narr1', startTimeSeconds: 1.0, fadeInSeconds: 0.2, text: 'ElevenLabs narration' }),
        trackType: 'NARRATION',
        trackVolume: 1,
        filePath: normMp3,
      },
      {
        cue: cue({ cueId: 'mus1', startTimeSeconds: 4.0, endTimeSeconds: 12, volume: 0.6, fadeOutSeconds: 1.0 }),
        trackType: 'MUSIC',
        trackVolume: 1,
        filePath: toneNorm,
      },
    ];
    await buildMixedAudioTrack({ sources, duckingWindows: [], canonicalRuntimeSeconds: RUNTIME_SECONDS, outputPath: mixPath, run });
    const mixProbe = await probeAudioStream(mixPath, run);
    const mixDelta = mixProbe.durationSeconds == null ? Number.POSITIVE_INFINITY : Math.abs(mixProbe.durationSeconds - RUNTIME_SECONDS);
    check(
      'mix lands on canonical runtime',
      mixProbe.hasAudioStream && mixDelta <= TOLERANCE,
      `dur=${mixProbe.durationSeconds}s vs ${RUNTIME_SECONDS}s (tol ${TOLERANCE}s)`,
    );

    // ── 4. Silent test video (matches MOVIE_RENDER_DEFAULTS) ────────────────
    await spawnCapture(FFMPEG_BIN, [
      '-y', '-f', 'lavfi', '-i', `testsrc=size=720x1280:rate=30:duration=${RUNTIME_SECONDS}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', silentPath,
    ]);

    // ── 5. Mux ──────────────────────────────────────────────────────────────
    await muxAudioWithVideo({ videoPath: silentPath, audioPath: mixPath, outputPath: finalPath, run });

    // ── 6. Ready gate + INDEPENDENT ffprobe ─────────────────────────────────
    const finalAudio = await probeAudioStream(finalPath, run);
    try {
      assertAudioReadyGate({ expectedAudio: true, probe: finalAudio, expectedVideoDurationSeconds: RUNTIME_SECONDS });
      check('audio READY gate', true, `codec=${finalAudio.codec} dur=${finalAudio.durationSeconds}s`);
    } catch (err) {
      check('audio READY gate', false, err instanceof Error ? err.message : String(err));
    }

    const raw = await spawnCapture(FFPROBE_BIN, [
      '-v', 'error',
      '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,duration',
      '-show_entries', 'format=duration',
      '-of', 'json', finalPath,
    ]);
    const parsed = JSON.parse(raw.stdout) as {
      streams?: Array<{ codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }>;
      format?: { duration?: string };
    };
    const video = (parsed.streams ?? []).find((s) => s.width);
    const audio = (parsed.streams ?? []).find((s) => !s.width && s.codec_name);
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const vdur = num(video?.duration ?? parsed.format?.duration);
    const adur = num(audio?.duration ?? parsed.format?.duration);
    const fpsParts = String(video?.avg_frame_rate ?? '').split('/').map(Number);
    const fps = fpsParts.length === 2 && fpsParts[1] ? fpsParts[0] / fpsParts[1] : fpsParts[0];
    check(
      'final video stream',
      video?.codec_name === 'h264' && video?.width === 720 && video?.height === 1280
        && Math.abs((fps ?? 0) - 30) < 0.01 && vdur != null && Math.abs(vdur - RUNTIME_SECONDS) <= TOLERANCE,
      `codec=${video?.codec_name} ${video?.width}x${video?.height} ${fps}fps dur=${vdur}s`,
    );
    check(
      'final audio stream',
      Boolean(audio?.codec_name) && adur != null && Math.abs(adur - RUNTIME_SECONDS) <= 0.5,
      `codec=${audio?.codec_name} dur=${adur}s (tol 0.5s)`,
    );
  } catch (err) {
    check('checkpoint completed', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (!KEEP) await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    else console.log(`  workdir kept: ${workdir}`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed\n`);
  return finish(failed.length === 0 ? 0 : 1);
}

function finish(code: number): never {
  process.exit(code);
}

main().catch((err) => {
  console.error('\nCheckpoint crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
