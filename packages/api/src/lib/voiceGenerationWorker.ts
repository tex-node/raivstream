/**
 * Phase 9B.2C.1 — Voice Generation worker.
 *
 * Mirrors movieRenderWorker.ts's own conventions deliberately: a simple
 * in-process "fire on next tick" queue (queueVoiceGenerationJob), a real
 * CommandRunner-based ffprobe validation (never trusting provider-reported
 * metadata alone), and a job marked READY only after every gate passes —
 * matching the "no silent skip" strictness already qualified for the audio
 * render pipeline this whole phase.
 *
 * Reads ONLY job.requestSnapshot — never live AudioCue/VoiceProfile state.
 * Does not touch StorySequence, Film Blueprint, AudioCue timing, or
 * audioMixing.ts/movieRenderWorker.ts in any way. Its only durable output
 * on success is one normal AudioAsset row.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@raivstream/database';
import { probeAudioAsset, type CommandRunner } from './audioMixing';
import { getPublicUrlForKey, uploadBufferToR2 } from './r2';
import { resolveVoiceGenerationProvider, type ProviderNeutralSpeechRequest, type VoiceGenerationProvider } from './voiceGenerationProviders';
import type { VoiceGenerationRequestSnapshot } from './voiceGeneration';
import { spawn } from 'node:child_process';

export const KNOWN_VOICE_GENERATION_ERROR_CODE_PREFIXES = [
  'VOICE_PROVIDER_NOT_CONFIGURED',
  'VOICE_PROVIDER_UNAVAILABLE',
  'VOICE_PROVIDER_REQUEST_FAILED',
  'VOICE_PROVIDER_TIMEOUT',
  'VOICE_GENERATION_INVALID_TEXT',
  'VOICE_GENERATION_UNSUPPORTED_CUE_TYPE',
  'VOICE_GENERATION_UNSUPPORTED_LANGUAGE',
  'VOICE_GENERATION_OUTPUT_INVALID',
  'VOICE_GENERATION_PROBE_FAILED',
  'VOICE_GENERATION_UPLOAD_FAILED',
  'VOICE_GENERATION_ASSET_PERSIST_FAILED',
];

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeoutMs = Number(process.env.VOICE_GENERATION_COMMAND_TIMEOUT_MS ?? 120000);
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c).slice(-4000); });
    child.on('error', (e) => { clearTimeout(timeout); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

function classifyErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = KNOWN_VOICE_GENERATION_ERROR_CODE_PREFIXES.find((code) => message.includes(code));
  return prefix ?? 'VOICE_GENERATION_FAILED';
}

/** Never leaks stack traces / raw provider error bodies to normal users — the sanitized message is what gets persisted to failureMessage and is safe to surface. */
function sanitizeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Strip anything that looks like it could be a credential/header value
  // (defense-in-depth; real provider errors should never reach this raw,
  // but nothing in this phase's dev-only provider can leak one anyway).
  // Two passes: "Bearer <token>" style (the token is the word AFTER the
  // keyword) and "key: <value>" / "key=<value>" style (redact the value
  // that follows the separator) — a single combined pattern would only
  // ever redact the first \S+ token, missing "Authorization: Bearer X"
  // where the actual secret is the *second* word.
  return message
    .replace(/\bbearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/(authorization|api[-_]?key|secret|token|password)\s*[:=]\s*\S+/gi, '$1: [redacted]')
    .slice(0, 1000);
}

async function updateJobStage(prisma: PrismaClient, jobId: string, data: Record<string, unknown>) {
  await (prisma as any).voiceGenerationJob.update({ where: { id: jobId }, data });
}

async function failJob(prisma: PrismaClient, jobId: string, error: unknown) {
  const code = classifyErrorCode(error);
  await updateJobStage(prisma, jobId, {
    status: 'FAILED',
    failureCode: code,
    failureMessage: sanitizeFailureMessage(error),
    failedAt: new Date(),
  });
}

/**
 * The actual worker execution — real provider call (dev fixture in this
 * phase), real ffprobe validation, real R2 upload, real AudioAsset
 * creation. READY is set only after every gate below passes; any failure
 * anywhere marks the job FAILED with a typed, sanitized reason and creates
 * no AudioAsset at all (Section 13's "do not mark READY immediately after
 * provider returns bytes").
 */
export async function executeVoiceGenerationJob(
  prisma: PrismaClient,
  jobId: string,
  options: {
    commandRunner?: CommandRunner;
    resolveProvider?: (providerKey: string) => VoiceGenerationProvider;
    uploadBuffer?: typeof uploadBufferToR2;
  } = {},
): Promise<void> {
  const run = options.commandRunner ?? runCommand;
  const resolveProvider = options.resolveProvider ?? resolveVoiceGenerationProvider;
  const upload = options.uploadBuffer ?? uploadBufferToR2;
  const job = await (prisma as any).voiceGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return; // job may have been deleted (e.g. cue/project cascade) between enqueue and execution — nothing to do
  if (job.status !== 'QUEUED') return; // already picked up / terminal — no double-execution

  // Atomic acquire: only one worker invocation can move this exact job out
  // of QUEUED. A concurrent second call to this function for the same
  // jobId will affect 0 rows and return early, rather than racing the
  // provider call.
  const acquired = await (prisma as any).voiceGenerationJob.updateMany({
    where: { id: jobId, status: 'QUEUED' },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 }, startedAt: new Date() },
  });
  if (acquired.count === 0) return;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-gen-'));
  try {
    const snapshot = job.requestSnapshot as VoiceGenerationRequestSnapshot;

    const provider = resolveProvider(job.providerKey);
    const providerRequest: ProviderNeutralSpeechRequest = {
      text: snapshot.text,
      language: snapshot.language,
      voice: snapshot.voice,
      performance: snapshot.performance,
      output: snapshot.output,
    };

    const result = await provider.generateSpeech(providerRequest, { jobId, tempDir });

    // ── Media READY gate (Section 13) — never trust provider metadata alone ──
    const fileStat = await stat(result.filePath).catch(() => null);
    if (!fileStat || fileStat.size === 0) {
      throw new Error('VOICE_GENERATION_OUTPUT_INVALID: provider returned no bytes.');
    }
    const probe = await probeAudioAsset(result.filePath, run).catch((e) => {
      throw new Error(`VOICE_GENERATION_PROBE_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    });
    if (!probe.hasAudioStream || !probe.durationSeconds || probe.durationSeconds <= 0) {
      throw new Error('VOICE_GENERATION_PROBE_FAILED: generated file has no valid audio stream.');
    }
    if (!probe.codec || !probe.sampleRateHz || !probe.channels) {
      throw new Error('VOICE_GENERATION_OUTPUT_INVALID: generated file is missing codec/sample-rate/channel data.');
    }

    const buffer = await readFile(result.filePath);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');

    // ── Section 15 — deterministic, server-generated storage key. Never
    // derived from arbitrary speech text; the job id alone (already a
    // non-guessable cuid, already scoped by the projectId path segment) is
    // sufficient, avoiding any path-traversal surface entirely. ──
    const extension = snapshot.output.format === 'wav' ? 'wav' : snapshot.output.format;
    const storageKey = `story-projects/${job.projectId}/audio/generated/${job.id}.${extension}`;
    const contentType = extension === 'wav' ? 'audio/wav' : `audio/${extension}`;
    const uploadedUrl = await upload(buffer, storageKey, contentType);
    if (!uploadedUrl) {
      throw new Error('VOICE_GENERATION_UPLOAD_FAILED: R2 upload did not return a URL (R2 not configured or upload error).');
    }
    // storageKey is the durable identity; re-derive the public URL from it
    // alone (same discipline as everywhere else in this codebase) rather
    // than trusting the upload response as anything but a same-run sanity
    // check.
    const publicUrl = getPublicUrlForKey(storageKey) ?? uploadedUrl;

    const asset = await (prisma as any).$transaction(async (tx: any) => {
      const created = await tx.audioAsset.create({
        data: {
          projectId: job.projectId,
          userId: job.userId,
          storageProvider: 'R2',
          storageKey,
          publicUrl,
          mimeType: contentType,
          durationSeconds: probe.durationSeconds,
          fileSizeBytes: buffer.length,
          checksum: checksumSha256,
          sampleRateHz: probe.sampleRateHz,
          channels: probe.channels,
          sourceKind: 'GENERATED_SPEECH',
        },
      }).catch((e: any) => { throw new Error(`VOICE_GENERATION_ASSET_PERSIST_FAILED: ${e instanceof Error ? e.message : String(e)}`); });

      await tx.voiceGenerationJob.update({
        where: { id: job.id },
        data: {
          status: 'READY',
          outputAudioAssetId: created.id,
          providerRequestId: result.providerRequestId,
          providerModel: result.providerModel,
          providerVoiceKey: result.providerVoiceKey,
          actualDurationSeconds: probe.durationSeconds,
          sampleRateHz: probe.sampleRateHz,
          channels: probe.channels,
          codec: probe.codec,
          mimeType: contentType,
          fileSizeBytes: buffer.length,
          checksumSha256,
          completedAt: new Date(),
        },
      });
      return created;
    });
    void asset;
  } catch (error) {
    await failJob(prisma, jobId, error);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function queueVoiceGenerationJob(prisma: PrismaClient, jobId: string) {
  if (process.env.VOICE_GENERATION_WORKER_DISABLED === 'true') return;
  const enqueue = typeof setImmediate === 'function' ? setImmediate : (cb: () => void) => setTimeout(cb, 0);
  enqueue(() => {
    executeVoiceGenerationJob(prisma, jobId).catch((error) => {
      console.warn('[voice-generation] worker crashed', jobId, error);
    });
  });
}
