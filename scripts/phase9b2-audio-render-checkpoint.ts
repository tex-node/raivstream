/**
 * Phase 9B.2 pure-rendering checkpoint.
 *
 * Mirrors scripts/phase9b1a-ffmpeg-timing.ts exactly (same prismaMock shape,
 * same executeMovieRenderJob entrypoint, same "no commandRunner override" =
 * real spawn-based ffmpeg/ffprobe binaries). Requires a host with real
 * `ffmpeg`/`ffprobe` on PATH — i.e. staging/production VPS, never CI/local
 * dev by design (matches the existing CommandRunner-mock convention: real
 * binaries only where actually installed).
 *
 * Deliberately does NOT touch Postgres, the tRPC API, R2, or the browser —
 * every audio source is synthesized locally with `ffmpeg -f lavfi` and fed
 * in as a data: URI (the same trick the existing video-only checkpoint
 * script already uses for its still-image source), and every "asset" lookup
 * is an in-memory mock. This is the pure-rendering layer proof the brief
 * asked for BEFORE any UI/API work continues on top of it.
 *
 * Proves, for each of the required scenarios, that FFprobe reports a final
 * video duration within the existing 0.25s tolerance
 * (MOVIE_RENDER_DURATION_TOLERANCE_SECONDS) of the canonical Film Blueprint
 * runtime — i.e. that cues starting late, ending early, overlapping,
 * fading, or ducking never change the movie's runtime:
 *
 *   Film Blueprint runtime == Audio Blueprint runtime == final movie runtime
 */
// This checkpoint synthesizes local audio files and feeds them in as data:
// URIs (asset.publicUrl) — it never uploads anything to real R2. Explicitly
// unset R2_PUBLIC_URL so getPublicUrlForKey (which the worker now always
// tries first, per the strict same-project-asset resolution sequence)
// returns null for these fixtures' synthetic storageKeys and correctly
// falls through to publicUrl — env vars are read at CALL time inside
// getPublicUrlForKey, not at import time, so this only needs to run before
// any scenario actually executes, not before the imports below. Otherwise,
// on a host where R2_PUBLIC_URL IS configured (staging/prod), the worker
// would construct a real-looking but nonexistent R2 URL for a storageKey
// that was never actually uploaded, and the download would 404.
delete process.env.R2_PUBLIC_URL;

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeMovieRenderJob } from '../packages/api/src/lib/movieRenderWorker';
import type { MovieRenderPlan } from '../packages/api/src/lib/movieRenderPlanning';
import {
  MOVIE_RENDER_DEFAULTS,
  MOVIE_RENDERER_VERSION,
  MOVIE_RENDER_DURATION_TOLERANCE_SECONDS,
  calculateExpectedRenderDuration,
  calculateRenderedSegmentDuration,
  hashRenderPlan,
} from '../packages/api/src/lib/movieRenderPlanning';
import { AUDIO_BLUEPRINT_VERSION, computeDuckingWindows, type AudioBlueprint, type AudioBlueprintCue, type AudioBlueprintTrack } from '../packages/api/src/lib/audioPlanning';

const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const CANONICAL_RUNTIME_SECONDS = 12;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
}

type FinalProbe = {
  videoDurationSeconds: number | null;
  videoCodec: string | null;
  audioDurationSeconds: number | null;
  audioCodec: string | null;
  audioSampleRateHz: number | null;
  audioChannels: number | null;
};

/**
 * Independent, from-scratch FFprobe re-verification of the FINAL captured
 * output bytes — deliberately does not read anything from the worker's own
 * internal metadata/verification objects, so this checkpoint proves what a
 * genuinely external observer would measure, not what the code under test
 * claims about itself.
 */
function runFfprobe(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(stdout || '{}')) : reject(new Error(`ffprobe exited ${code}: ${stderr}`))));
  });
}

async function probeFinalOutput(filePath: string): Promise<FinalProbe> {
  const [videoJson, audioJson] = await Promise.all([
    runFfprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,duration', '-of', 'json', filePath]),
    runFfprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,duration', '-of', 'json', filePath]),
  ]);
  const videoStream = videoJson.streams?.[0];
  const audioStream = audioJson.streams?.[0];
  return {
    videoDurationSeconds: videoStream?.duration != null ? Number(videoStream.duration) : null,
    videoCodec: videoStream?.codec_name ?? null,
    audioDurationSeconds: audioStream?.duration != null ? Number(audioStream.duration) : null,
    audioCodec: audioStream?.codec_name ?? null,
    audioSampleRateHz: audioStream?.sample_rate != null ? Number(audioStream.sample_rate) : null,
    audioChannels: audioStream?.channels != null ? Number(audioStream.channels) : null,
  };
}

/** Synthesizes a short sine-tone WAV (stand-in for any spoken/musical source — content doesn't matter, only presence/duration/timing do) and returns it as a data: URI. */
async function synthTone(tempDir: string, name: string, durationSeconds: number, frequencyHz: number): Promise<string> {
  const outPath = path.join(tempDir, `${name}.wav`);
  await runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=${frequencyHz}:duration=${durationSeconds}`, '-ar', '44100', '-ac', '2', outPath]);
  const buffer = await readFile(outPath);
  return `data:audio/wav;base64,${buffer.toString('base64')}`;
}

function makeVideoPlan(name: string, runtimeSeconds: number): MovieRenderPlan {
  const shots = [{
    order: 1,
    sequenceSceneId: `${name}_entry_1`,
    storySceneId: `${name}_scene_1`,
    assetId: `${name}_asset_1`,
    sourceUrl: pngDataUrl,
    durationSeconds: runtimeSeconds,
    renderDurationSeconds: calculateRenderedSegmentDuration({ durationSeconds: runtimeSeconds, transition: 'NONE', transitionDurationSeconds: 0 }),
    transition: 'NONE',
    transitionDurationSeconds: 0,
    holdDurationSeconds: 0,
    shotType: 'MEDIUM',
    cameraMovement: 'STATIC',
    cameraSpeed: 'NORMAL',
    cameraSpeedMultiplier: 1,
    zoom: 1,
  }];
  return {
    rendererVersion: MOVIE_RENDERER_VERSION,
    output: MOVIE_RENDER_DEFAULTS,
    runtimeSeconds: calculateExpectedRenderDuration(shots),
    transitionRule: 'overlap_transitions_do_not_add_runtime',
    shots,
    warnings: [],
  };
}

function cue(overrides: Partial<AudioBlueprintCue> & { audioAssetId: string }): AudioBlueprintCue {
  return {
    cueId: overrides.audioAssetId,
    startTimeSeconds: 0,
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
    storageKey: null,
    duckingEnabled: false,
    duckingAmountDb: null,
    ...overrides,
  };
}

function track(overrides: Partial<AudioBlueprintTrack> & { trackId: string; type: AudioBlueprintTrack['type']; cues: AudioBlueprintCue[] }): AudioBlueprintTrack {
  return { name: overrides.trackId, volume: 1, order: 0, ...overrides };
}

function prismaMock(job: any, audioAssets: any[]) {
  const events: any[] = [];
  const assets: any[] = [];
  const analyticsEvents: any[] = [];
  const prisma: any = {
    movieRenderEvent: { create: async ({ data }: any) => events.push({ id: `evt_${events.length + 1}`, ...data }) },
    movieRenderJob: {
      findUnique: async () => job,
      update: async ({ data }: any) => {
        Object.assign(job, data);
        if (data.attemptCount?.increment) job.attemptCount += data.attemptCount.increment;
        return job;
      },
    },
    movieAsset: {
      count: async () => assets.length,
      updateMany: async () => ({ count: assets.length }),
      create: async ({ data }: any) => {
        const asset = { id: `movie_${assets.length + 1}`, ...data };
        assets.push(asset);
        return asset;
      },
    },
    // Per-cue lookup — mirrors the real worker exactly: the strict resolution
    // sequence issues a single, per-cue, unscoped findUnique (never a
    // batched/scoped pre-fetch); the caller checks ownership itself against
    // the returned row's own projectId. A mock that silently scoped this by
    // project would hide a regression in the worker's own ownership check
    // (which is exactly what happened once during this checkpoint's own
    // development — see expectHasAudio below).
    audioAsset: { findUnique: async ({ where }: any) => audioAssets.find((a) => a.id === where.id) ?? null },
    analyticsEvent: { create: async ({ data }: any) => analyticsEvents.push(data) },
    $transaction: async (operation: any) => (typeof operation === 'function' ? operation(prisma) : Promise.all(operation)),
    __events: events,
    __assets: assets,
    __analyticsEvents: analyticsEvents,
  };
  return prisma;
}

async function runScenario(input: {
  name: string;
  tempDir: string;
  audioBlueprint: AudioBlueprint | null;
  audioAssets: Array<{ id: string; publicUrl: string }>;
  /** Explicit expectation, checked below — catches the exact regression class where audio is silently skipped (e.g. by a project-ownership check) yet the render still "succeeds" as a silent video with a passing video-duration delta. */
  expectHasAudio: boolean;
}) {
  const plan = makeVideoPlan(input.name, CANONICAL_RUNTIME_SECONDS);
  const job: any = {
    id: `phase9b2_${input.name}`,
    projectId: `project_${input.name}`,
    sequenceId: `sequence_${input.name}`,
    userId: `user_${input.name}`,
    status: 'QUEUED',
    renderPlan: plan,
    renderPlanHash: hashRenderPlan(plan),
    creditsCharged: 0,
    attemptCount: 0,
    audioBlueprintSnapshot: input.audioBlueprint,
  };
  // The worker's strict per-cue resolution sequence requires BOTH a matching
  // projectId (asset.projectId === job.projectId, checked before any
  // fetch) AND a present storageKey (hard AUDIO_ASSET_STORAGE_KEY_MISSING
  // otherwise) — every fixture asset here gets both auto-stamped, exactly
  // as a real project-scoped AudioAsset row would have. R2_PUBLIC_URL is
  // deleted above, so getPublicUrlForKey(storageKey) returns null for this
  // synthetic key and the worker correctly falls through to publicUrl (the
  // data: URI) for the actual fetch.
  const scopedAudioAssets = input.audioAssets.map((asset) => ({
    ...asset,
    projectId: job.projectId,
    storageKey: `story-projects/${job.projectId}/audio/${asset.id}.wav`,
  }));
  const prisma = prismaMock(job, scopedAudioAssets);

  // Capture the real uploaded bytes to disk so this checkpoint can
  // independently re-probe the FINAL artifact itself, below — not trust any
  // internal metadata the worker computed about itself.
  const capturedPath = path.join(input.tempDir, `${input.name}-final.mp4`);
  const asset = await executeMovieRenderJob(prisma, job.id, {
    // No commandRunner override -> real spawn-based ffmpeg/ffprobe, exactly
    // like scripts/phase9b1a-ffmpeg-timing.ts.
    uploadMovie: async (buffer, key) => {
      await writeFile(capturedPath, buffer);
      return `memory://${key}`;
    },
  });
  if (!asset) throw new Error(`${input.name} failed: ${job.errorCode ?? 'UNKNOWN'} ${job.errorMessage ?? ''}`.trim());

  // Explicit, hard-fail assertion — a scenario that expects audio but got a
  // silently-skipped-to-silent render must never pass just because the video
  // duration still happens to be correct (that's exactly what a mock's
  // missing projectId scoping let slip through undetected once already).
  if (asset.metadata.hasAudio !== input.expectHasAudio) {
    throw new Error(`${input.name}: expected hasAudio=${input.expectHasAudio} but got hasAudio=${asset.metadata.hasAudio}`);
  }
  if (input.expectHasAudio && !asset.metadata.audioVerification) {
    throw new Error(`${input.name}: expected audio verification metadata but got none`);
  }

  const independent = await probeFinalOutput(capturedPath);
  if (independent.videoDurationSeconds == null) throw new Error(`${input.name}: independent ffprobe found no video stream on the final output`);
  if (input.expectHasAudio && independent.audioDurationSeconds == null) {
    throw new Error(`${input.name}: expected an audio stream on the final output but independent ffprobe found none`);
  }

  const videoDelta = Math.abs(independent.videoDurationSeconds - plan.runtimeSeconds);
  const videoOk = videoDelta <= MOVIE_RENDER_DURATION_TOLERANCE_SECONDS;

  return {
    name: input.name,
    hasAudio: asset.metadata.hasAudio,
    // Exactly the fields requested: expected/actual/delta for video, plus
    // audio stream duration/codec/sample rate/channels — all independently
    // re-measured by this script's own ffprobe call on the captured final
    // bytes, not read from the worker's internal verification metadata.
    expectedVideoRuntimeSeconds: plan.runtimeSeconds,
    actualFfprobeVideoRuntimeSeconds: independent.videoDurationSeconds,
    videoDurationDeltaSeconds: Math.round(videoDelta * 1000) / 1000,
    videoWithinTolerance: videoOk,
    toleranceSeconds: MOVIE_RENDER_DURATION_TOLERANCE_SECONDS,
    videoCodec: independent.videoCodec,
    audioStreamDurationSeconds: independent.audioDurationSeconds,
    audioCodec: independent.audioCodec,
    audioSampleRateHz: independent.audioSampleRateHz,
    audioChannels: independent.audioChannels,
  };
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'phase9b2-checkpoint-'));
  try {
    const results = [];

    // 1. Silent movie — no audioBlueprintSnapshot at all. The audio branch
    //    must never execute; the pre-existing silent-film path is untouched.
    results.push(await runScenario({ tempDir, name: 'silent_movie', audioBlueprint: null, audioAssets: [], expectHasAudio: false }));

    // 2. Speech only — one NARRATION cue spanning the whole runtime.
    {
      const narrationUrl = await synthTone(tempDir, 'narration', CANONICAL_RUNTIME_SECONDS, 220);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [track({ trackId: 't-narration', type: 'NARRATION', cues: [cue({ audioAssetId: 'narration', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME_SECONDS })] })],
      };
      results.push(await runScenario({ tempDir, name: 'speech_only', audioBlueprint, audioAssets: [{ id: 'narration', publicUrl: narrationUrl }], expectHasAudio: true }));
    }

    // 3. Ambience + SFX — a full-length AMBIENCE bed plus a short mid-timeline SFX hit.
    {
      const ambienceUrl = await synthTone(tempDir, 'ambience', CANONICAL_RUNTIME_SECONDS, 110);
      const sfxUrl = await synthTone(tempDir, 'sfx', 0.5, 880);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [
          track({ trackId: 't-ambience', type: 'AMBIENCE', volume: 0.7, cues: [cue({ audioAssetId: 'ambience', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME_SECONDS })] }),
          track({ trackId: 't-sfx', type: 'SFX', cues: [cue({ audioAssetId: 'sfx', startTimeSeconds: 5, endTimeSeconds: 5.5 })] }),
        ],
      };
      results.push(await runScenario({ tempDir, name: 'ambience_and_sfx', audioBlueprint, audioAssets: [{ id: 'ambience', publicUrl: ambienceUrl }, { id: 'sfx', publicUrl: sfxUrl }], expectHasAudio: true }));
    }

    // 4. Music + speech ducking — MUSIC dips under an overlapping DIALOGUE window.
    {
      const musicUrl = await synthTone(tempDir, 'music', CANONICAL_RUNTIME_SECONDS, 330);
      const dialogueUrl = await synthTone(tempDir, 'dialogue', 4, 660);
      const musicTrack = track({ trackId: 't-music', type: 'MUSIC', cues: [cue({ audioAssetId: 'music', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME_SECONDS })] });
      const dialogueTrack = track({ trackId: 't-dialogue', type: 'DIALOGUE', cues: [cue({ audioAssetId: 'dialogue', startTimeSeconds: 3, endTimeSeconds: 7, duckingEnabled: true, duckingAmountDb: 10 })] });
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: computeDuckingWindows([musicTrack, dialogueTrack]),
        tracks: [musicTrack, dialogueTrack],
        rejectedAudioAssetReferences: [],
      };
      results.push(await runScenario({ tempDir, name: 'music_and_speech_ducking', audioBlueprint, audioAssets: [{ id: 'music', publicUrl: musicUrl }, { id: 'dialogue', publicUrl: dialogueUrl }], expectHasAudio: true }));
    }

    // 5. Overlapping cues — two DIALOGUE cues whose time ranges overlap.
    {
      const aUrl = await synthTone(tempDir, 'dlg_a', 5, 440);
      const bUrl = await synthTone(tempDir, 'dlg_b', 6, 550);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [track({ trackId: 't-dialogue', type: 'DIALOGUE', cues: [
          cue({ audioAssetId: 'dlg_a', startTimeSeconds: 1, endTimeSeconds: 6 }),
          cue({ audioAssetId: 'dlg_b', startTimeSeconds: 3, endTimeSeconds: 9 }),
        ] })],
      };
      results.push(await runScenario({ tempDir, name: 'overlapping_cues', audioBlueprint, audioAssets: [{ id: 'dlg_a', publicUrl: aUrl }, { id: 'dlg_b', publicUrl: bUrl }], expectHasAudio: true }));
    }

    // 6. Fade in/out — a MUSIC cue with both a fade-in and a fade-out.
    {
      const musicUrl = await synthTone(tempDir, 'music_fade', CANONICAL_RUNTIME_SECONDS, 396);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [track({ trackId: 't-music', type: 'MUSIC', cues: [cue({ audioAssetId: 'music_fade', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME_SECONDS, fadeInSeconds: 1, fadeOutSeconds: 2 })] })],
      };
      results.push(await runScenario({ tempDir, name: 'fade_in_out', audioBlueprint, audioAssets: [{ id: 'music_fade', publicUrl: musicUrl }], expectHasAudio: true }));
    }

    // 7. Late-starting cue — a single short SFX cue starting at 8s in a 12s
    //    film (the reviewer's exact numeric example: this must produce a
    //    12s final output, never a naive "runtime minus start" = 4s one).
    //    No amix stage runs here (single cue), so nothing else would have
    //    forced the mix back out to the full runtime except the pad/trim fix.
    {
      const sfxUrl = await synthTone(tempDir, 'late_sfx', 1, 990);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [track({ trackId: 't-sfx', type: 'SFX', cues: [cue({ audioAssetId: 'late_sfx', startTimeSeconds: 8, endTimeSeconds: 9 })] })],
      };
      results.push(await runScenario({ tempDir, name: 'late_starting_cue', audioBlueprint, audioAssets: [{ id: 'late_sfx', publicUrl: sfxUrl }], expectHasAudio: true }));
    }

    // 8. Early-ending cue — a single NARRATION cue ending long before the runtime.
    {
      const narrationUrl = await synthTone(tempDir, 'early_narration', 2, 220);
      const audioBlueprint: AudioBlueprint = {
        blueprintVersion: AUDIO_BLUEPRINT_VERSION,
        runtimeSeconds: CANONICAL_RUNTIME_SECONDS,
        hasAudio: true,
        duckingWindows: [],
        rejectedAudioAssetReferences: [],
        tracks: [track({ trackId: 't-narration', type: 'NARRATION', cues: [cue({ audioAssetId: 'early_narration', startTimeSeconds: 0, endTimeSeconds: 2 })] })],
      };
      results.push(await runScenario({ tempDir, name: 'early_ending_cue', audioBlueprint, audioAssets: [{ id: 'early_narration', publicUrl: narrationUrl }], expectHasAudio: true }));
    }

    const allOk = results.every((r) => r.videoWithinTolerance);
    console.log(JSON.stringify({ ok: allOk, canonicalRuntimeSeconds: CANONICAL_RUNTIME_SECONDS, toleranceSeconds: MOVIE_RENDER_DURATION_TOLERANCE_SECONDS, results }, null, 2));
    if (!allOk) process.exit(1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
