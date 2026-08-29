/**
 * Phase 9B.2C.1 — provider-neutral adapter contract + registry + the
 * deterministic development/test provider.
 *
 * Business logic (voiceGenerationWorker.ts) talks ONLY to
 * VoiceGenerationProvider — never to a vendor SDK, never to a vendor
 * request/response shape. No file in this codebase may import an
 * ElevenLabs/OpenAI/Google/Azure/AWS/Cartesia/PlayHT/Resemble/RunPod SDK
 * directly; a real provider, when one is added, implements this interface
 * and registers here — nowhere else needs to change.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TRPCError } from '@trpc/server';

export type VoiceGenerationCapabilities = {
  providerKey: string;
  languages: string[]; // '*' element means "any"
  outputFormats: string[];
  maxCharacters: number;
  supportsStreaming: boolean;
};

export type ProviderNeutralSpeechRequest = {
  text: string;
  language: string | null;
  voice: {
    stableVoiceIdentity: string | null;
    voiceType: string | null;
    accentStyle: string | null;
    pitch: number | null;
    rate: number | null;
    styleNotes: string | null;
  };
  performance: {
    preset: string | null;
    direction: string | null;
  };
  output: {
    format: string;
    sampleRateHz: number | null;
    channels: number | null;
  };
};

export type ProviderExecutionContext = {
  jobId: string;
  /** Directory the provider should write its output file into. Provider never chooses the final R2 storage key — see voiceGenerationWorker.ts §15. */
  tempDir: string;
};

export type GeneratedSpeechResult = {
  /** Local filesystem path to the generated audio file. */
  filePath: string;
  providerRequestId: string | null;
  providerModel: string | null;
  providerVoiceKey: string | null;
};

export interface VoiceGenerationProvider {
  key: string;
  capabilities(): VoiceGenerationCapabilities;
  generateSpeech(request: ProviderNeutralSpeechRequest, context: ProviderExecutionContext): Promise<GeneratedSpeechResult>;
}

// ─── Development/test provider ─────────────────────────────────────────────
//
// Section 8: fully testable without a real speech provider. NOT
// production-quality TTS — a deterministic sine-tone fixture, matching the
// exact "synthesize deterministic local tone" pattern already proven
// throughout this project's own qualification scripts this phase. Its key
// makes its nature unmistakable and it can never run unless explicitly
// enabled (see developmentProviderAllowed below).
export const DEV_FIXTURE_PROVIDER_KEY = 'test-fixture-dev';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += String(c).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
}

/** Deterministic function of the request text — same text -> same tone every time, different text -> a different (but still deterministic) tone. */
function deterministicToneParamsFromText(text: string): { frequencyHz: number; durationSeconds: number } {
  const digest = createHash('sha256').update(text).digest();
  const frequencyHz = 220 + (digest.readUInt16BE(0) % 400); // 220-619 Hz, always audible, always valid
  // ~12 chars/second of "speech" is a reasonable deterministic stand-in; clamped to a sane fixture range.
  const durationSeconds = Math.min(8, Math.max(1, Math.round((text.length / 12) * 10) / 10));
  return { frequencyHz, durationSeconds };
}

const developmentProvider: VoiceGenerationProvider = {
  key: DEV_FIXTURE_PROVIDER_KEY,
  capabilities: () => ({
    providerKey: DEV_FIXTURE_PROVIDER_KEY,
    languages: ['*'],
    outputFormats: ['wav'],
    maxCharacters: 2000,
    supportsStreaming: false,
  }),
  generateSpeech: async (request, context) => {
    const { frequencyHz, durationSeconds } = deterministicToneParamsFromText(request.text);
    const sampleRate = request.output.sampleRateHz ?? 44100;
    const channels = request.output.channels ?? 1;
    const filePath = path.join(context.tempDir, `${context.jobId}.dev-fixture.wav`);
    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequencyHz}:duration=${durationSeconds}`,
      '-ar', String(sampleRate), '-ac', String(channels), filePath,
    ]);
    return {
      filePath,
      providerRequestId: `dev-fixture-${context.jobId}`,
      providerModel: 'sine-tone-fixture-v1',
      providerVoiceKey: request.voice.stableVoiceIdentity ?? 'dev-fixture-default-voice',
    };
  },
};

// ─── Registry / configuration policy (Section 9) ───────────────────────────
//
// Production: no development provider, no automatic test provider —
// generation is unavailable until a real provider is deliberately
// configured (none is added in this phase). Development/staging: the
// fixture provider may be enabled explicitly via
// VOICE_GENERATION_DEV_PROVIDER_ENABLED=true. This is a single explicit
// flag, the same trust model already used for MOVIE_RENDER_WORKER_DISABLED
// elsewhere in this codebase — NODE_ENV cannot distinguish staging from
// production here (`next start` always reports NODE_ENV=production
// regardless of deployment target, confirmed earlier this phase), so the
// operational discipline is: production's .env must never set this flag.

function developmentProviderAllowed(): boolean {
  return process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED === 'true';
}

/** Never exposes secrets/tokens — just the stable provider keys currently usable. */
export function listConfiguredVoiceGenerationProviders(): string[] {
  const keys: string[] = [];
  if (developmentProviderAllowed()) keys.push(DEV_FIXTURE_PROVIDER_KEY);
  // A real provider (ElevenLabs/OpenAI/etc.) would be appended here once
  // deliberately configured with real credentials — Phase 9B.2C.1 ships
  // none; see docs/operations/phase-9b2c1-voice-generation-core.md.
  return keys;
}

export function providerIsConfigured(providerKey: string): boolean {
  return listConfiguredVoiceGenerationProviders().includes(providerKey);
}

export function voiceGenerationDiagnosticsSummary() {
  const configuredProviderKeys = listConfiguredVoiceGenerationProviders();
  return {
    voiceGenerationConfigured: configuredProviderKeys.length > 0,
    configuredProviderKeys,
    developmentProviderEnabled: developmentProviderAllowed(),
    providerConfigurationHealthy: true, // this phase has no real-provider health check to fail; a real adapter would report its own reachability here
  };
}

export const VOICE_PROVIDER_NOT_CONFIGURED = 'VOICE_PROVIDER_NOT_CONFIGURED';

export function resolveVoiceGenerationProvider(providerKey: string): VoiceGenerationProvider {
  if (!providerIsConfigured(providerKey)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${VOICE_PROVIDER_NOT_CONFIGURED}: no configured voice generation provider for key "${providerKey}".`,
    });
  }
  if (providerKey === DEV_FIXTURE_PROVIDER_KEY) return developmentProvider;
  // Unreachable while providerIsConfigured only ever returns the dev
  // fixture key, but kept explicit rather than falling through silently —
  // exactly the same "never silently fall back to another paid provider"
  // rule Section 7 requires once a second provider key exists.
  throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `${VOICE_PROVIDER_NOT_CONFIGURED}: unrecognized provider key "${providerKey}".` });
}

/** The single provider key the service layer resolves against for SPEECH generation in this phase — see resolveDefaultVoiceGenerationProviderKey in voiceGeneration.ts equivalents. Exported for the worker/service and for tests. */
export function defaultVoiceGenerationProviderKey(): string {
  return DEV_FIXTURE_PROVIDER_KEY;
}
