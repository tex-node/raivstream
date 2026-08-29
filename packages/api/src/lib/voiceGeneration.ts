/**
 * Phase 9B.2C.1 — provider-neutral Voice Generation Core.
 *
 * This file owns the parts of the generation pipeline that must be pure,
 * deterministic, and provider-neutral: the immutable request snapshot, its
 * fingerprint, source-text validation, and cue-eligibility rules. The
 * worker (voiceGenerationWorker.ts) reads ONLY the persisted snapshot this
 * file produces — never live AudioCue/VoiceProfile state — the same
 * discipline already proven for MovieRenderJob.audioBlueprintSnapshot.
 *
 * ARCHITECTURAL INVARIANT: generation materializes audio. It never defines
 * or alters film/audio timing. Nothing in this file reads or writes
 * StorySequence, Film Blueprint, or AudioCue.startTimeSeconds/
 * durationSeconds — the snapshot only ever *records* the cue's existing
 * canonical duration for diagnostic/mismatch purposes, never rewrites it.
 */

import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';

export const VOICE_GENERATION_SNAPSHOT_SCHEMA_VERSION = 1;

export const SPEECH_CAPABLE_TRACK_TYPES = ['NARRATION', 'DIALOGUE'] as const;
export type SpeechCapableTrackType = (typeof SPEECH_CAPABLE_TRACK_TYPES)[number];

export const SOURCE_TEXT_MAX_LENGTH = 2000; // platform-wide ceiling; a provider may enforce a stricter one later

/**
 * The immutable, provider-neutral creative-intent snapshot a generation job
 * is created from. Deliberately excludes anything transient: no signed
 * URLs, no temp paths, no timestamps, no worker IDs, no provider secrets —
 * matching the exact forbidden-field discipline already proven for
 * AudioBlueprint (see audioPlanning.ts's own header comment).
 */
export type VoiceGenerationRequestSnapshot = {
  schemaVersion: number;
  generationType: 'SPEECH';
  projectId: string;
  audioCueId: string;

  text: string;
  language: string | null;

  voice: {
    voiceProfileId: string | null;
    // VoiceProfile.voiceRef is already documented in schema.prisma as "a
    // provider-neutral voice reference/handle, never a raw provider model
    // id" — this is the one field allowed to carry a stable cross-provider
    // voice identity. Everything else here is pure creative intent.
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

  provider: {
    providerKey: string;
    providerModel: string | null;
    providerVoiceKey: string | null;
  };

  // Diagnostic-only: the cue's canonical duration AT SNAPSHOT TIME, so the
  // worker can report a mismatch between generated-media duration and cue
  // duration. Never consulted to rewrite anything — see module header.
  cueCanonicalDurationSeconds: number | null;
};

export type VoiceEligibleCue = {
  id: string;
  text: string | null;
  performancePreset: string | null;
  performanceDirection: string | null;
  durationSeconds: number | null;
  voiceProfileId: string | null;
  trackType: string;
};

export type VoiceEligibleProfile = {
  id: string;
  voiceRef: string | null;
  voiceType: string | null;
  accentStyle: string | null;
  pitch: number | null;
  rate: number | null;
  styleNotes: string | null;
  language: string | null;
};

/** Section 10.5 / Section 27.D — only speech-capable track types may generate. */
export function assertCueSpeechEligible(trackType: string): asserts trackType is SpeechCapableTrackType {
  if (!SPEECH_CAPABLE_TRACK_TYPES.includes(trackType as SpeechCapableTrackType)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `VOICE_GENERATION_UNSUPPORTED_CUE_TYPE: voice generation is only available for NARRATION/DIALOGUE cues, not ${trackType}.`,
    });
  }
}

/**
 * Section 11 — deterministic, non-destructive validation. Never summarizes,
 * paraphrases, translates, censors, or adds punctuation — trims only
 * leading/trailing whitespace (semantically safe; never touches internal
 * content) and rejects what's left if empty or over the platform ceiling.
 */
export function validateSourceText(rawText: string | null | undefined): string {
  const text = (rawText ?? '').trim();
  if (text.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'VOICE_GENERATION_INVALID_TEXT: this cue has no text to generate speech from.' });
  }
  if (text.length > SOURCE_TEXT_MAX_LENGTH) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `VOICE_GENERATION_INVALID_TEXT: text exceeds the ${SOURCE_TEXT_MAX_LENGTH}-character platform maximum.` });
  }
  return text;
}

export function buildVoiceGenerationRequestSnapshot(input: {
  projectId: string;
  cue: VoiceEligibleCue;
  voiceProfile: VoiceEligibleProfile | null;
  providerKey: string;
  providerModel?: string | null;
  providerVoiceKey?: string | null;
  requestedFormat: string;
  requestedSampleRateHz?: number | null;
  requestedChannels?: number | null;
}): VoiceGenerationRequestSnapshot {
  const text = validateSourceText(input.cue.text);
  return {
    schemaVersion: VOICE_GENERATION_SNAPSHOT_SCHEMA_VERSION,
    generationType: 'SPEECH',
    projectId: input.projectId,
    audioCueId: input.cue.id,
    text,
    language: input.voiceProfile?.language ?? null,
    voice: {
      voiceProfileId: input.voiceProfile?.id ?? null,
      stableVoiceIdentity: input.voiceProfile?.voiceRef ?? null,
      voiceType: input.voiceProfile?.voiceType ?? null,
      accentStyle: input.voiceProfile?.accentStyle ?? null,
      pitch: input.voiceProfile?.pitch ?? null,
      rate: input.voiceProfile?.rate ?? null,
      styleNotes: input.voiceProfile?.styleNotes ?? null,
    },
    performance: {
      preset: input.cue.performancePreset ?? null,
      direction: input.cue.performanceDirection ?? null,
    },
    output: {
      format: input.requestedFormat,
      sampleRateHz: input.requestedSampleRateHz ?? null,
      channels: input.requestedChannels ?? null,
    },
    provider: {
      providerKey: input.providerKey,
      providerModel: input.providerModel ?? null,
      providerVoiceKey: input.providerVoiceKey ?? null,
    },
    cueCanonicalDurationSeconds: input.cue.durationSeconds ?? null,
  };
}

/**
 * Stable key ordering, explicit normalized structure — deliberately NOT a
 * plain `JSON.stringify` over an arbitrary object (whose key order is
 * insertion-order-dependent and therefore not a safe fingerprint basis).
 * Every field that materially defines "what would be generated" is listed
 * by name; nothing transient (timestamps, IDs, retry counts, worker IDs)
 * is reachable from this function at all, because none of it exists on
 * VoiceGenerationRequestSnapshot in the first place.
 */
export function canonicalizeVoiceGenerationSnapshot(snapshot: VoiceGenerationRequestSnapshot): string {
  const parts = [
    `schemaVersion=${snapshot.schemaVersion}`,
    `generationType=${snapshot.generationType}`,
    `text=${normalizeTextForFingerprint(snapshot.text)}`,
    `language=${snapshot.language ?? ''}`,
    `voice.voiceProfileId=${snapshot.voice.voiceProfileId ?? ''}`,
    `voice.stableVoiceIdentity=${snapshot.voice.stableVoiceIdentity ?? ''}`,
    `voice.voiceType=${snapshot.voice.voiceType ?? ''}`,
    `voice.accentStyle=${snapshot.voice.accentStyle ?? ''}`,
    `voice.pitch=${snapshot.voice.pitch ?? ''}`,
    `voice.rate=${snapshot.voice.rate ?? ''}`,
    `voice.styleNotes=${snapshot.voice.styleNotes ?? ''}`,
    `performance.preset=${snapshot.performance.preset ?? ''}`,
    `performance.direction=${snapshot.performance.direction ?? ''}`,
    `output.format=${snapshot.output.format}`,
    `output.sampleRateHz=${snapshot.output.sampleRateHz ?? ''}`,
    `output.channels=${snapshot.output.channels ?? ''}`,
    `provider.providerKey=${snapshot.provider.providerKey}`,
    `provider.providerModel=${snapshot.provider.providerModel ?? ''}`,
    `provider.providerVoiceKey=${snapshot.provider.providerVoiceKey ?? ''}`,
  ];
  return parts.join('\n');
}

function normalizeTextForFingerprint(text: string): string {
  // Whitespace-collapse only — never alters meaning, just prevents two
  // requests that differ only in incidental double-spacing from being
  // treated as materially different generations.
  return text.trim().replace(/\s+/g, ' ');
}

/** Section 4 — the deterministic material-identity fingerprint. */
export function fingerprintVoiceGenerationRequest(snapshot: VoiceGenerationRequestSnapshot): string {
  return createHash('sha256').update(canonicalizeVoiceGenerationSnapshot(snapshot)).digest('hex');
}
