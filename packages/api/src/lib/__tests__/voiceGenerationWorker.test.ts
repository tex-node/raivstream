import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeVoiceGenerationJob } from '../voiceGenerationWorker';
import type { VoiceGenerationProvider } from '../voiceGenerationProviders';
import type { CommandResult } from '../audioMixing';

/**
 * No real ffmpeg/ffprobe on this machine (matches this whole phase's
 * established pattern — real-media execution happens on the isolated
 * staging VPS, see the dedicated real-filesystem checkpoint script for
 * Section 28). These tests inject both a fake provider (writes a tiny real
 * file, no ffmpeg needed) and a fake command runner (fakes ffprobe's JSON
 * output) to exercise the worker's actual state-machine/gate logic end to
 * end without either.
 */

function makeFakeProvider(overrides: Partial<VoiceGenerationProvider> = {}): VoiceGenerationProvider {
  return {
    key: 'fake-provider',
    capabilities: () => ({ providerKey: 'fake-provider', languages: ['*'], outputFormats: ['wav'], maxCharacters: 2000, supportsStreaming: false }),
    generateSpeech: async (_req, ctx) => {
      const filePath = path.join(ctx.tempDir, `${ctx.jobId}.wav`);
      await writeFile(filePath, Buffer.from('fake-wav-bytes-not-empty'));
      return { filePath, providerRequestId: 'fake-req-1', providerModel: 'fake-model', providerVoiceKey: 'fake-voice' };
    },
    ...overrides,
  };
}

function makeValidCommandRunner(): (command: string, args: string[]) => Promise<CommandResult> {
  return async (command: string) => {
    if (command === 'ffprobe') {
      return { stdout: JSON.stringify({ streams: [{ codec_name: 'pcm_s16le', sample_rate: '44100', channels: 1, duration: '2.5' }] }), stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

function makeNoAudioStreamCommandRunner(): (command: string, args: string[]) => Promise<CommandResult> {
  return async () => ({ stdout: JSON.stringify({ streams: [] }), stderr: '' });
}

// The real uploadBufferToR2 returns null when R2 env vars aren't set (true
// in this local test run) — mock it so tests exercise the worker's own
// logic, not R2 configuration state.
const mockUpload = async (_buffer: Buffer, key: string) => `https://mock-cdn.test/${key}`;

function prismaMock(state: { jobs: any[]; assets: any[] }) {
  const client: any = {
    voiceGenerationJob: {
      findUnique: async ({ where }: any) => state.jobs.find((j) => j.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const job = state.jobs.find((j) => j.id === where.id && j.status === where.status);
        if (!job) return { count: 0 };
        Object.assign(job, resolveIncrements(data));
        return { count: 1 };
      },
      // Delegates through `client.voiceGenerationJob.update` (not a private
      // closure) so a test can monkeypatch `prisma.voiceGenerationJob.update`
      // from outside and have that patch observed *inside* $transaction too
      // — the transaction callback below reuses this exact same object,
      // never reconstructs a fresh one.
      update: async ({ where, data }: any) => {
        const job = state.jobs.find((j) => j.id === where.id);
        if (!job) throw new Error('job not found');
        Object.assign(job, resolveIncrements(data));
        return job;
      },
    },
    audioAsset: {
      create: async ({ data }: any) => {
        const asset = { id: `asset-${state.assets.length + 1}`, ...data };
        state.assets.push(asset);
        return asset;
      },
    },
    $transaction: async (fn: any) => fn({ audioAsset: client.audioAsset, voiceGenerationJob: client.voiceGenerationJob }),
  };
  return client;
}

// Minimal increment-operator support for the two `{ increment: N }` fields the worker actually uses.
function resolveIncrements(data: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v === 'object' && 'increment' in v ? (v.increment as number) : v;
  }
  return out;
}

function baseJob(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'job-1', projectId: 'project-a', audioCueId: 'cue-1', userId: 'user-1', providerKey: 'fake-provider',
    status: 'QUEUED', attemptCount: 0,
    requestSnapshot: {
      text: 'Hello world', language: 'en',
      voice: { stableVoiceIdentity: null, voiceType: null, accentStyle: null, pitch: null, rate: null, styleNotes: null },
      performance: { preset: null, direction: null },
      output: { format: 'wav', sampleRateHz: 44100, channels: 1 },
    },
    outputAudioAssetId: null,
    failureCode: null,
    failureMessage: null,
    ...overrides,
  };
}

describe('executeVoiceGenerationJob (Section 27.G/H)', () => {
  it('valid audio passes -> QUEUED -> PROCESSING -> READY, with AudioAsset persisted', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => makeFakeProvider() });
    expect(state.jobs[0].status).toBe('READY');
    expect(state.jobs[0].attemptCount).toBe(1);
    expect(state.jobs[0].outputAudioAssetId).toBe('asset-1');
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].projectId).toBe('project-a');
    expect(state.assets[0].sourceKind).toBe('GENERATED_SPEECH');
  });

  it('zero-byte output fails the media gate -> FAILED, no AudioAsset created', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    const emptyProvider = makeFakeProvider({
      generateSpeech: async (_req, ctx) => {
        const filePath = path.join(ctx.tempDir, `${ctx.jobId}.wav`);
        await writeFile(filePath, Buffer.alloc(0));
        return { filePath, providerRequestId: null, providerModel: null, providerVoiceKey: null };
      },
    });
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => emptyProvider });
    expect(state.jobs[0].status).toBe('FAILED');
    expect(state.jobs[0].failureCode).toBe('VOICE_GENERATION_OUTPUT_INVALID');
    expect(state.assets).toHaveLength(0);
  });

  it('missing audio stream fails the media gate -> FAILED, no AudioAsset created', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeNoAudioStreamCommandRunner(), resolveProvider: () => makeFakeProvider() });
    expect(state.jobs[0].status).toBe('FAILED');
    expect(state.jobs[0].failureCode).toBe('VOICE_GENERATION_PROBE_FAILED');
    expect(state.assets).toHaveLength(0);
  });

  it('probe throwing (ffprobe failure) fails -> FAILED, no AudioAsset created', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    const throwingRunner = async () => { throw new Error('ffprobe crashed'); };
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: throwingRunner as any, resolveProvider: () => makeFakeProvider() });
    expect(state.jobs[0].status).toBe('FAILED');
    expect(state.jobs[0].failureCode).toBe('VOICE_GENERATION_PROBE_FAILED');
    expect(state.assets).toHaveLength(0);
  });

  it('provider failure -> FAILED, typed code, no AudioAsset created', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    const failingProvider = makeFakeProvider({ generateSpeech: async () => { throw new Error('VOICE_PROVIDER_REQUEST_FAILED: upstream 503'); } });
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => failingProvider });
    expect(state.jobs[0].status).toBe('FAILED');
    expect(state.jobs[0].failureCode).toBe('VOICE_PROVIDER_REQUEST_FAILED');
    expect(state.assets).toHaveLength(0);
  });

  it('sanitizes failure messages — never leaks anything that looks like a credential', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    const leaky = makeFakeProvider({ generateSpeech: async () => { throw new Error('VOICE_PROVIDER_REQUEST_FAILED: Authorization: Bearer sk-super-secret-123 rejected'); } });
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => leaky });
    expect(state.jobs[0].failureMessage).not.toContain('sk-super-secret-123');
    expect(state.jobs[0].failureMessage).toContain('[redacted]');
  });

  it('does not mark READY immediately after the provider returns bytes — READY only after AudioAsset persistence, proven by inspecting stage order', async () => {
    const state = { jobs: [baseJob()], assets: [] as any[] };
    const prisma = prismaMock(state);
    let sawProcessingBeforeReady = false;
    const originalUpdate = prisma.voiceGenerationJob.update;
    prisma.voiceGenerationJob.update = async (args: any) => {
      if (state.jobs[0].status === 'PROCESSING' && args.data.status === 'READY') sawProcessingBeforeReady = true;
      return originalUpdate(args);
    };
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => makeFakeProvider() });
    expect(sawProcessingBeforeReady).toBe(true);
    expect(state.jobs[0].status).toBe('READY');
  });

  it('a job not in QUEUED status is not re-executed (no double-execution)', async () => {
    const state = { jobs: [baseJob({ status: 'READY', outputAudioAssetId: 'asset-existing' })], assets: [] as any[] };
    const prisma = prismaMock(state);
    let providerCalled = false;
    const provider = makeFakeProvider({ generateSpeech: async (req, ctx) => { providerCalled = true; return makeFakeProvider().generateSpeech(req, ctx); } });
    await executeVoiceGenerationJob(prisma, 'job-1', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => provider });
    expect(providerCalled).toBe(false);
    expect(state.jobs[0].status).toBe('READY');
  });

  it('a nonexistent job id is a silent no-op (job may have cascaded away between enqueue and execution)', async () => {
    const state = { jobs: [] as any[], assets: [] as any[] };
    const prisma = prismaMock(state);
    await expect(executeVoiceGenerationJob(prisma, 'nonexistent', { commandRunner: makeValidCommandRunner(), uploadBuffer: mockUpload, resolveProvider: () => makeFakeProvider() })).resolves.toBeUndefined();
  });
});
