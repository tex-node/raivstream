/**
 * Movie Builder — native-clip-audio guard (2026-10-13 fix).
 *
 * Regression: the Phase 16.5 native-audio sources were pushed into `sources`
 * *inside* `if (sources.length > 0)`, so a project with no materialised cues but
 * audible clips rendered a movie with no audio track. These tests assert the mix
 * decision / constructed graph (ffmpeg is absent locally; the runner is injected).
 *
 *   1. no cues + audible clips → mix runs, output has audio
 *   2. cue sources + audible clips → mix runs, all sources combined
 *   3. no cues + no audible clips → mix skipped, video-only (unchanged)
 *   4. renderer version bump changes the render-plan hash
 */

import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { executeMovieRenderJob } from '../movieRenderWorker';
import { hashRenderPlan, MOVIE_RENDERER_VERSION, type MovieRenderPlan } from '../movieRenderPlanning';
import type { AudioBlueprint } from '../audioPlanning';

function prismaMock(job: any, audioAssets: any[] = []) {
  const assets: any[] = [];
  const prisma: any = {
    movieRenderEvent: { create: async ({ data }: any) => ({ id: 'evt', ...data }) },
    movieRenderJob: { findUnique: async () => job, update: async ({ data }: any) => { Object.assign(job, data); return job; } },
    movieAsset: { count: async () => assets.length, updateMany: async () => ({ count: assets.length }), create: async ({ data }: any) => { const a = { id: `movie_${assets.length + 1}`, ...data }; assets.push(a); return a; } },
    audioAsset: { findUnique: async ({ where }: any) => audioAssets.find((a) => a.id === where.id) ?? null },
    analyticsEvent: { create: async () => undefined },
    $transaction: async (op: any) => (typeof op === 'function' ? op(prisma) : Promise.all(op)),
    __assets: assets,
  };
  return prisma;
}

function plan(shotCount: number, sourceType: 'VIDEO' | 'IMAGE' = 'VIDEO'): MovieRenderPlan {
  return {
    rendererVersion: MOVIE_RENDERER_VERSION,
    output: { width: 720, height: 1280, fps: 30, container: 'mp4', videoCodec: 'libx264', pixelFormat: 'yuv420p' },
    runtimeSeconds: 4 * shotCount,
    transitionRule: 'overlap_transitions_do_not_add_runtime',
    warnings: [],
    shots: Array.from({ length: shotCount }, (_, i) => ({
      order: i + 1, sequenceSceneId: `entry_${i + 1}`, storySceneId: `scene_${i + 1}`, assetId: `asset_${i + 1}`,
      sourceType, sourceUrl: 'data:text/plain;base64,c291cmNl',
      durationSeconds: 4, renderDurationSeconds: 4, transition: 'NONE', transitionDurationSeconds: 0,
      holdDurationSeconds: 0, shotType: 'MEDIUM', cameraMovement: 'STATIC', cameraSpeed: 'NORMAL', cameraSpeedMultiplier: 1, zoom: 1,
    })),
  };
}

const cueBlueprint: AudioBlueprint = {
  blueprintVersion: 'phase-9b2-v1', runtimeSeconds: 4, hasAudio: true, duckingWindows: [], rejectedAudioAssetReferences: [],
  tracks: [{
    trackId: 't1', type: 'MUSIC', name: 'Music', volume: 1, order: 0,
    cues: [{
      cueId: 'cue1', startTimeSeconds: 0, endTimeSeconds: 4, trimStartSeconds: 0, trimEndSeconds: null,
      volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null,
      sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: 'audio_asset_1', storageKey: null,
      duckingEnabled: false, duckingAmountDb: null,
    }],
  }],
};

const AUDIO_ASSET = { id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/a.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' };

/** ffprobe `a:0` returns audio for source clips iff `clipsAudible`; captures the mix ffmpeg args. */
function runner(clipsAudible: boolean, runtimeSeconds: number) {
  const calls: { mix: string[] | null } = { mix: null };
  const run = async (command: string, args: string[]) => {
    if (command === 'ffmpeg') {
      const out = String(args[args.length - 1]);
      if (out.includes('mixed-audio.m4a')) calls.mix = args;
      await writeFile(out, Buffer.from('fake output'));
      return;
    }
    if (command === 'ffprobe') {
      if (args.includes('a:0')) {
        const file = String(args[args.length - 1]);
        if (file.endsWith('.source')) {
          return { stdout: JSON.stringify({ streams: clipsAudible ? [{ codec_name: 'aac', sample_rate: '32000', channels: 2, duration: '4.000000' }] : [] }) };
        }
        return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: `${runtimeSeconds}.000000` }] }) };
      }
      return { stdout: JSON.stringify({ streams: [{ codec_name: 'h264', codec_type: 'video', width: 720, height: 1280, avg_frame_rate: '30/1', duration: `${runtimeSeconds}.000000` }], format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: `${runtimeSeconds}.000000`, size: '11' } }) };
    }
  };
  return { run, calls };
}

async function runJob(job: any, audioAssets: any[], clipsAudible: boolean) {
  const prisma = prismaMock(job, audioAssets);
  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;
  const { run, calls } = runner(clipsAudible, job.renderPlan.runtimeSeconds);
  try {
    const asset = await executeMovieRenderJob(prisma, job.id, { commandRunner: run, uploadMovie: async (_b: Buffer, key: string) => `https://cdn.test/${key}` });
    return { asset, calls };
  } finally {
    global.fetch = originalFetch;
  }
}

function job(id: string, renderPlan: MovieRenderPlan, audioBlueprintSnapshot: AudioBlueprint | null) {
  return { id, projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1', status: 'QUEUED', renderPlan, renderPlanHash: `hash_${id}`, creditsCharged: 0, attemptCount: 0, keepNativeAudio: true, audioBlueprintSnapshot };
}

describe('Movie Builder — native clip audio guard', () => {
  it('1. no cues + audible clips → the mix runs and the output has audio', async () => {
    const { asset, calls } = await runJob(job('n1', plan(2), null), [], true);
    expect(asset?.metadata.hasAudio).toBe(true);
    expect(calls.mix).not.toBeNull();
  });

  it('2. cue sources + audible clips → the mix runs with all sources combined', async () => {
    const { asset, calls } = await runJob(job('n2', plan(1), cueBlueprint), [AUDIO_ASSET], true);
    expect(asset?.metadata.hasAudio).toBe(true);
    const mix = (calls.mix ?? []).join(' ');
    expect(mix).toContain('.audio.wav'); // native clip audio
    expect(mix).toContain('.normalized.wav'); // materialised cue
  });

  it('3. no cues + no audible clips → the mix is skipped (video-only, unchanged)', async () => {
    const { asset, calls } = await runJob(job('n3', plan(2), null), [], false);
    expect(asset?.metadata.hasAudio).toBe(false);
    expect(calls.mix).toBeNull();
  });

  it('4. the renderer version is folded into the render-plan hash', () => {
    const a = plan(1);
    const b: MovieRenderPlan = { ...plan(1), rendererVersion: 'phase-16-v1' };
    const c: MovieRenderPlan = { ...plan(1), rendererVersion: 'phase-16-v2' };
    expect(hashRenderPlan(b)).not.toBe(hashRenderPlan(c));
    expect(hashRenderPlan(a)).toBe(hashRenderPlan({ ...a, rendererVersion: MOVIE_RENDERER_VERSION }));
    expect(MOVIE_RENDERER_VERSION).toBe('phase-16-v2');
  });
});
