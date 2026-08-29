import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { executeMovieRenderJob } from '../movieRenderWorker';
import type { MovieRenderPlan } from '../movieRenderPlanning';
import type { AudioBlueprint } from '../audioPlanning';

// Mirrors the exact mocking style of the existing (proven) movieRenderWorker.test.ts.
function prismaMock(job: any, audioAssets: any[] = []) {
  const events: any[] = [];
  const assets: any[] = [];
  const analyticsEvents: any[] = [];
  const prisma: any = {
    movieRenderEvent: {
      create: async ({ data }: any) => events.push({ id: `evt_${events.length + 1}`, ...data }),
    },
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
    audioAsset: {
      // Per-cue lookup — mirrors the real worker exactly: step 2 of the
      // ordered resolution sequence is a single, per-cue, unscoped
      // findUnique (never a batched/scoped pre-fetch). Ownership (step 4) is
      // checked by the CALLER against the returned row's own projectId, not
      // by this mock filtering anything — exactly like real Prisma, which
      // has no way to "scope" a findUnique by a second column.
      findUnique: async ({ where }: any) => audioAssets.find((a) => a.id === where.id) ?? null,
    },
    analyticsEvent: {
      create: async ({ data }: any) => analyticsEvents.push(data),
    },
    $transaction: async (operation: any) => {
      if (typeof operation === 'function') return operation(prisma);
      return Promise.all(operation);
    },
    __events: events,
    __assets: assets,
    __analyticsEvents: analyticsEvents,
  };
  return prisma;
}

const renderPlan: MovieRenderPlan = {
  rendererVersion: 'phase-9b1a-v2',
  output: { width: 720, height: 1280, fps: 30, container: 'mp4', videoCodec: 'libx264', pixelFormat: 'yuv420p' },
  runtimeSeconds: 4,
  transitionRule: 'overlap_transitions_do_not_add_runtime',
  warnings: [],
  shots: [{
    order: 1, sequenceSceneId: 'entry_1', storySceneId: 'scene_1', assetId: 'asset_1',
    sourceUrl: 'data:text/plain;base64,c291cmNl', durationSeconds: 4, renderDurationSeconds: 4,
    transition: 'NONE', transitionDurationSeconds: 0, holdDurationSeconds: 0,
    shotType: 'MEDIUM', cameraMovement: 'STATIC', cameraSpeed: 'NORMAL', cameraSpeedMultiplier: 1, zoom: 1,
  }],
};

const audioBlueprint: AudioBlueprint = {
  blueprintVersion: 'phase-9b2-v1',
  runtimeSeconds: 4,
  hasAudio: true,
  duckingWindows: [],
  rejectedAudioAssetReferences: [],
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

function makeCommandRunner() {
  return async (command: string, args: string[]) => {
    if (command === 'ffmpeg') {
      const outputPath = args[args.length - 1];
      await writeFile(outputPath, Buffer.from('fake output'));
      return;
    }
    if (command === 'ffprobe') {
      // Audio-specific probe request selects stream a:0; video probe selects v:0.
      if (args.includes('a:0')) {
        return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
      }
      return {
        stdout: JSON.stringify({
          streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
          format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
        }),
      };
    }
  };
}

/**
 * Same as makeCommandRunner, but counts exactly which stage of the
 * materialized-cue pipeline actually ran, by output-path shape — the video
 * shot/assembly ffmpeg calls fall through uncounted, so these counters are
 * specifically about the AUDIO pipeline: normalize (step 9), mix (step 10's
 * buildMixedAudioTrack), mux (muxAudioWithVideo). Used to prove a hard
 * failure at an earlier step genuinely stops the pipeline dead, not just
 * that the final error code looks right.
 */
function makeTrackingCommandRunner() {
  const calls = { normalize: 0, mix: 0, mux: 0 };
  const run = async (command: string, args: string[]) => {
    if (command === 'ffmpeg') {
      const outputPath = String(args[args.length - 1]);
      if (outputPath.includes('.normalized.wav')) calls.normalize++;
      else if (outputPath.includes('mixed-audio.m4a')) calls.mix++;
      else if (outputPath.includes('movie-with-audio.mp4')) calls.mux++;
      await writeFile(args[args.length - 1], Buffer.from('fake output'));
      return;
    }
    if (command === 'ffprobe') {
      if (args.includes('a:0')) {
        return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
      }
      return {
        stdout: JSON.stringify({
          streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
          format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
        }),
      };
    }
  };
  return { run, calls };
}

/** Tracks every URL fetched, and separately reports how many were for the AUDIO pipeline specifically — the video shot's own data: URI download always runs first, unconditionally, regardless of what happens in the audio branch, so a bare "0 fetches total" assertion would be wrong; "0 non-data: fetches" isolates the audio asset's own download attempts. */
function trackFetch() {
  const urls: string[] = [];
  const fetchImpl = (async (url: any) => {
    urls.push(String(url));
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  }) as any;
  return { fetchImpl, urls, audioFetchCount: () => urls.filter((u) => !u.startsWith('data:')).length };
}

describe('movieRenderWorker — audio-integrated path', () => {
  it('mixes audio, mux with video, and freezes the Audio Blueprint into MovieAsset.metadata (required test J)', async () => {
    const job: any = {
      id: 'audio_job_1', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_1', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint,
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_1', {
        commandRunner: makeCommandRunner(),
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(job.status).toBe('READY');
      expect(asset?.metadata.hasAudio).toBe(true);
      expect(asset?.metadata.audioVerification.codec).toBe('aac');
      expect(asset?.metadata.audioVerification.sampleRateHz).toBe(44100);
      expect(asset?.metadata.audioVerification.channels).toBe(2);
      // The frozen snapshot on the job is untouched by anything downstream —
      // it is literally the same object handed to executeMovieRenderJob.
      expect(job.audioBlueprintSnapshot).toBe(audioBlueprint);
      expect(prisma.__analyticsEvents.some((e: any) => e.eventName === 'movie_render_with_audio_completed')).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fails the render (never READY) when the audio blueprint expects audio but the muxed output has no audio stream', async () => {
    const job: any = {
      id: 'audio_job_2', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_2', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint,
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    const commandRunner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        await writeFile(outputPath, Buffer.from('fake output'));
        return;
      }
      if (command === 'ffprobe') {
        const filePath = args[args.length - 1];
        if (args.includes('a:0')) {
          // The input source (post-normalize) genuinely has audio — the
          // failure this test proves is specifically a MUX-stage failure
          // (the muxed OUTPUT has no audio stream), not an input problem.
          if (filePath.includes('movie-with-audio')) {
            return { stdout: JSON.stringify({ streams: [] }) }; // no audio stream produced by the mux
          }
          return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
        }
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
          }),
        };
      }
    };

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_2', { commandRunner, uploadMovie: async () => 'https://cdn.test/x' });
      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('OUTPUT_AUDIO_STREAM_MISSING');
      expect(prisma.__assets).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Negative test requested explicitly: a mix shorter than the canonical
  // runtime must never reach READY. The real fix (buildMixFilterGraph's
  // apad/atrim stage) makes this unreachable through normal code paths, so
  // this proves the READY gate itself is the backstop — mocking ffprobe to
  // report exactly the failure mode the padding fix exists to prevent (an
  // audio stream that decoded shorter than the film) rather than trying to
  // defeat the real padding logic.
  it('fails the render (never READY) when the muxed output audio stream duration is shorter than the canonical runtime', async () => {
    const job: any = {
      id: 'audio_job_3', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_3', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint, // runtimeSeconds: 4
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    const commandRunner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        await writeFile(outputPath, Buffer.from('fake output'));
        return;
      }
      if (command === 'ffprobe') {
        const filePath = args[args.length - 1];
        if (args.includes('a:0')) {
          if (filePath.includes('movie-with-audio')) {
            // Simulates exactly the pre-fix failure mode: a valid audio
            // stream that is shorter than the 4s canonical runtime.
            return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '1.000000' }] }) };
          }
          return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
        }
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
          }),
        };
      }
    };

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_3', { commandRunner, uploadMovie: async () => 'https://cdn.test/x' });
      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('OUTPUT_AUDIO_VERIFICATION_FAILED');
      expect(prisma.__assets).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Second negative test: the audio stream itself reports the full expected
  // duration, but the MUXED VIDEO stream comes back short — proving the
  // independent post-mux video re-check (not just the audio-duration check)
  // is what catches this. This is the exact failure class the original
  // defect actually was: video truncation, not an audio-side symptom.
  it('fails the render (never READY) when muxing truncates the VIDEO stream, even though the audio stream duration looks correct', async () => {
    const job: any = {
      id: 'audio_job_4', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_4', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint, // runtimeSeconds: 4
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    const commandRunner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        await writeFile(outputPath, Buffer.from('fake output'));
        return;
      }
      if (command === 'ffprobe') {
        const filePath = args[args.length - 1];
        if (args.includes('a:0')) {
          // Audio duration looks entirely correct on its own.
          return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
        }
        if (filePath.includes('movie-with-audio')) {
          // The muxed file's VIDEO stream came back truncated to 1s — this
          // is the scenario the reviewer flagged as the actual original
          // defect (video truncation), which an audio-only check would miss.
          return {
            stdout: JSON.stringify({
              streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '1.000000' }],
              format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '1.000000', size: '11' },
            }),
          };
        }
        // Pre-mux silent probe — full, correct 4s duration.
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
          }),
        };
      }
    };

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_4', { commandRunner, uploadMovie: async () => 'https://cdn.test/x' });
      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('OUTPUT_DURATION_MISMATCH');
      expect(prisma.__assets).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Ownership test 3 of 3 (the other two — allowed / denied at the API layer,
  // plus buildAudioBlueprint's own typed-rejection tests — live in
  // audioAssetOwnership.test.ts and audioPlanning.test.ts): a persisted cue
  // whose audioAssetId points at a REAL asset row that belongs to a
  // DIFFERENT project. This is constructed by hand here specifically to
  // bypass buildAudioBlueprint's own defensive resolution (resolvedAudioAssets)
  // — simulating a bad reference that reached a snapshot by some path other
  // than the normal write-time API, which is exactly the scenario the
  // worker's own independent, unscoped-existence-check gate exists to catch.
  // A confirmed cross-project reference (the asset genuinely exists, just for
  // another project) must FAIL THE WHOLE RENDER, never quietly drop the one
  // cue and continue — silently absorbing a tampering attempt is worse than
  // being loud about it.
  it('fails the whole render (never READY) when a persisted cue references a real asset that belongs to a different project', async () => {
    const twoCueBlueprint: AudioBlueprint = {
      blueprintVersion: 'phase-9b2-v1',
      runtimeSeconds: 4,
      hasAudio: true,
      duckingWindows: [],
      rejectedAudioAssetReferences: [],
      tracks: [{
        trackId: 't1', type: 'MUSIC', name: 'Music', volume: 1, order: 0,
        // Tampered cue listed FIRST — resolution is strictly per-cue,
        // sequential, in this order (per the required 10-step sequence), so
        // this proves the mismatch is caught before EITHER cue's asset is
        // ever fetched, not just before its own.
        cues: [
          {
            // Tampered: this audioAssetId is a REAL row in `audioAsset`, but
            // it belongs to project_2, not this job's project_1.
            cueId: 'tampered-cue', startTimeSeconds: 0, endTimeSeconds: 4, trimStartSeconds: 0, trimEndSeconds: null,
            volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null,
            sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: 'foreign_asset', storageKey: 'story-projects/project_2/audio/foreign.wav',
            duckingEnabled: false, duckingAmountDb: null,
          },
          {
            cueId: 'legit-cue', startTimeSeconds: 0, endTimeSeconds: 4, trimStartSeconds: 0, trimEndSeconds: null,
            volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null,
            sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: 'audio_asset_1', storageKey: null,
            duckingEnabled: false, duckingAmountDb: null,
          },
        ],
      }],
    };
    const job: any = {
      id: 'audio_job_5', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_5', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: twoCueBlueprint,
    };
    const prisma = prismaMock(job, [
      { id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' },
      { id: 'foreign_asset', projectId: 'project_2', publicUrl: 'https://cdn.test/foreign.mp3', storageKey: 'story-projects/project_2/audio/foreign.wav' },
    ]);
    const originalFetch = global.fetch;
    const fetchedUrls: string[] = [];
    global.fetch = (async (url: any) => {
      fetchedUrls.push(String(url));
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }) as any;

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_5', {
        commandRunner: makeCommandRunner(),
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_PROJECT_MISMATCH');
      expect(prisma.__assets).toHaveLength(0);
      // The mismatch is detected before any download happens at all — not
      // even the legitimate cue's asset gets fetched, since the whole job
      // fails before the mixing/download loop runs.
      expect(fetchedUrls.some((u) => u.includes('foreign'))).toBe(false);
      expect(fetchedUrls.some((u) => u.includes('audio_asset_1'))).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // A cue that CLAIMS materialized audio (has an audioAssetId) but the asset
  // genuinely doesn't exist anywhere (deleted after the cue was created, or
  // never existed) is now ALSO a hard failure — the strict per-cue sequence
  // has no soft-skip step for this. "Speech intent with no materialized
  // audio" is a different condition entirely (audioAssetId was never set at
  // all) and is filtered out upstream, before this loop, by
  // summarizeUnmaterializedSpeechCues/preflight — it never reaches step 1.
  it('fails the whole render (never READY) when a materialized cue\'s audioAssetId does not exist at all', async () => {
    const job: any = {
      id: 'audio_job_6', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_6', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint, // cue1 -> 'audio_asset_1'
    };
    const prisma = prismaMock(job, []); // nothing exists — not for this project, not for any project
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_6', {
        commandRunner: makeCommandRunner(),
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_NOT_FOUND');
      expect(prisma.__assets).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Same-project, existing asset row — but with no storageKey at all and no
  // publicUrl fallback either. Nothing resolvable, hard fail.
  it('fails the whole render (never READY) when the asset row has no storageKey and no resolvable URL', async () => {
    const job: any = {
      id: 'audio_job_7', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_7', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint,
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: null, storageKey: null }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_7', {
        commandRunner: makeCommandRunner(),
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_STORAGE_KEY_MISSING');
      expect(prisma.__assets).toHaveLength(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // The downloaded bytes themselves fail to probe as audio at all (corrupt
  // upload, wrong content type, etc.) — probed on the RAW download, before
  // normalization is ever attempted (step 8 precedes step 9).
  it('fails the whole render (never READY) when the downloaded asset cannot be probed as audio', async () => {
    const job: any = {
      id: 'audio_job_8', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_8', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint,
    };
    const prisma = prismaMock(job, [{ id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3', storageKey: 'story-projects/project_1/audio/audio_asset_1.wav' }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;
    let normalizeWasCalled = false;

    const commandRunner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        if (String(outputPath).includes('.normalized.wav')) normalizeWasCalled = true;
        await writeFile(outputPath, Buffer.from('fake output'));
        return;
      }
      if (command === 'ffprobe') {
        const filePath = args[args.length - 1];
        if (args.includes('a:0')) {
          if (String(filePath).includes('.source')) {
            return { stdout: JSON.stringify({ streams: [] }) }; // the RAW download is not usable audio
          }
          return { stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '4.000000' }] }) };
        }
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '11' },
          }),
        };
      }
    };

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_8', { commandRunner, uploadMovie: async () => 'https://cdn.test/x' });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_PROBE_FAILED');
      expect(prisma.__assets).toHaveLength(0);
      expect(normalizeWasCalled).toBe(false); // step 9 never runs once step 8 fails
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Builds a single-cue blueprint whose cue carries a snapshot storageKey,
  // paired with a same-project DB asset row — the shared fixture for the
  // four "canonical provenance contract" tests below. Only storageKey
  // (snapshot side) and the DB row's own fields vary between them.
  function makeSnapshotVsDbFixture(input: { snapshotStorageKey: string; dbStorageKey: string | null; dbProjectId?: string }) {
    const blueprint: AudioBlueprint = {
      blueprintVersion: 'phase-9b2-v1',
      runtimeSeconds: 4,
      hasAudio: true,
      duckingWindows: [],
      rejectedAudioAssetReferences: [],
      tracks: [{
        trackId: 't1', type: 'MUSIC', name: 'Music', volume: 1, order: 0,
        cues: [{
          cueId: 'cue1', startTimeSeconds: 0, endTimeSeconds: 4, trimStartSeconds: 0, trimEndSeconds: null,
          volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null,
          sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: 'asset-1',
          storageKey: input.snapshotStorageKey,
          duckingEnabled: false, duckingAmountDb: null,
        }],
      }],
    };
    const dbAsset = {
      id: 'asset-1',
      projectId: input.dbProjectId ?? 'project-a',
      publicUrl: 'https://cdn.test/fallback.mp3',
      storageKey: input.dbStorageKey,
    };
    return { blueprint, dbAsset };
  }

  // The canonical provenance-contract invariant: snapshot identity == current
  // canonical asset identity, or the render fails. Nothing silently wins —
  // a disagreement is a typed, loud failure. Proven here with call-count
  // assertions, not just the error code: zero downloads, zero normalize
  // calls, zero mux calls, zero MovieAsset rows created. This is what makes
  // the render snapshot a verifiable contract rather than merely advisory —
  // otherwise an old render job could go on claiming it rendered Asset A
  // while actually rendering whatever later replaced it.
  it('fails the whole render (never READY) when the snapshot storageKey disagrees with the canonical DB value — zero downloads, zero mix, zero mux, zero MovieAsset rows', async () => {
    const { blueprint, dbAsset } = makeSnapshotVsDbFixture({
      snapshotStorageKey: 'audio/project-a/original.wav',
      dbStorageKey: 'audio/project-a/replaced.wav', // the asset's canonical key has moved on since the snapshot was taken
    });
    const job: any = {
      id: 'audio_job_9', projectId: 'project-a', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_9', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: blueprint,
    };
    const prisma = prismaMock(job, [dbAsset]);
    const originalFetch = global.fetch;
    const { fetchImpl, audioFetchCount } = trackFetch();
    global.fetch = fetchImpl;
    const { run, calls } = makeTrackingCommandRunner();

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_9', {
        commandRunner: run,
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_STORAGE_KEY_MISMATCH');
      // Zero MovieAsset rows created.
      expect(prisma.__assets).toHaveLength(0);
      // Zero downloads for the audio asset (the video shot's own data: URI
      // download still runs unconditionally earlier in the pipeline —
      // audioFetchCount() excludes it, isolating the audio asset's own
      // resolution attempts specifically).
      expect(audioFetchCount()).toBe(0);
      // Zero normalize calls, zero mix calls, zero mux calls — the mismatch
      // is caught at step 5.5, before step 6 (URL resolution) even runs, so
      // nothing downstream of it ever executes.
      expect(calls.normalize).toBe(0);
      expect(calls.mix).toBe(0);
      expect(calls.mux).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Companion: the DB asset row itself has a null storageKey — step 5 (which
  // runs BEFORE step 5.5's mismatch comparison) catches this first,
  // regardless of what the snapshot claims. Same zero-download,
  // zero-MovieAsset proof.
  it('fails the whole render (never READY) when the canonical DB asset has a null storageKey, even though the snapshot has one', async () => {
    const { blueprint, dbAsset } = makeSnapshotVsDbFixture({
      snapshotStorageKey: 'audio/project-a/original.wav',
      dbStorageKey: null,
    });
    const job: any = {
      id: 'audio_job_11', projectId: 'project-a', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_11', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: blueprint,
    };
    const prisma = prismaMock(job, [dbAsset]);
    const originalFetch = global.fetch;
    const { fetchImpl, audioFetchCount } = trackFetch();
    global.fetch = fetchImpl;
    const { run, calls } = makeTrackingCommandRunner();

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_11', {
        commandRunner: run,
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(asset).toBeNull();
      expect(job.status).toBe('FAILED');
      expect(job.errorCode).toBe('AUDIO_ASSET_STORAGE_KEY_MISSING');
      expect(prisma.__assets).toHaveLength(0);
      expect(audioFetchCount()).toBe(0);
      expect(calls.normalize).toBe(0);
      expect(calls.mix).toBe(0);
      expect(calls.mux).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Positive control: after tightening the negative path, prove the valid
  // path still works — snapshot key === DB key downloads exactly that
  // canonical key and the render continues through to READY.
  it('downloads exactly the canonical DB key and continues to READY when the snapshot storageKey matches it', async () => {
    const { blueprint, dbAsset } = makeSnapshotVsDbFixture({
      snapshotStorageKey: 'audio/project-a/original.wav',
      dbStorageKey: 'audio/project-a/original.wav', // identical — no mismatch
    });
    const job: any = {
      id: 'audio_job_12', projectId: 'project-a', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_12', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: blueprint,
    };
    const prisma = prismaMock(job, [dbAsset]);
    const originalFetch = global.fetch;
    const { fetchImpl, urls } = trackFetch();
    global.fetch = fetchImpl;
    const originalR2PublicUrl = process.env.R2_PUBLIC_URL;
    process.env.R2_PUBLIC_URL = 'https://cdn.example.test'; // makes the key-derived URL observable
    const { run, calls } = makeTrackingCommandRunner();

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_12', {
        commandRunner: run,
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(job.status).toBe('READY');
      expect(asset?.metadata.hasAudio).toBe(true);
      expect(job.errorCode).toBeUndefined();
      // Exactly the canonical key was fetched — not zero, not something else.
      expect(urls.some((u) => u.includes('audio/project-a/original.wav'))).toBe(true);
      expect(calls.normalize).toBe(1);
      expect(calls.mix).toBe(1);
      expect(calls.mux).toBe(1);
    } finally {
      global.fetch = originalFetch;
      process.env.R2_PUBLIC_URL = originalR2PublicUrl;
    }
  });

  // Companion: a snapshot with NO storageKey at all (predates this field, or
  // the blueprint-builder never resolved one for this cue) has nothing to
  // compare against — not a mismatch, proceeds normally using the canonical
  // DB value.
  it('proceeds normally when the snapshot has no storageKey to compare — not a mismatch', async () => {
    const job: any = {
      id: 'audio_job_10', projectId: 'project_1', sequenceId: 'sequence_1', userId: 'user_1',
      status: 'QUEUED', renderPlan, renderPlanHash: 'hash_10', creditsCharged: 0, attemptCount: 0,
      audioBlueprintSnapshot: audioBlueprint, // shared fixture — its cue.storageKey is null
    };
    const prisma = prismaMock(job, [{
      id: 'audio_asset_1', projectId: 'project_1', publicUrl: 'https://cdn.test/audio_asset_1.mp3',
      storageKey: 'story-projects/project_1/audio/audio_asset_1.wav',
    }]);
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as any;

    try {
      const asset = await executeMovieRenderJob(prisma, 'audio_job_10', {
        commandRunner: makeCommandRunner(),
        uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
      });

      expect(job.status).toBe('READY');
      expect(asset?.metadata.hasAudio).toBe(true);
      expect(job.errorCode).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
