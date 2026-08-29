import crypto from 'node:crypto';
import { stableStringify } from './movieRenderPlanning';
import { computeCanonicalShotTimeline, type FilmBlueprint } from './sequencePlanning';

export const AUDIO_BLUEPRINT_VERSION = 'phase-9b2-v1';

export const AUDIO_TRACK_TYPES = ['NARRATION', 'DIALOGUE', 'AMBIENCE', 'SFX', 'MUSIC'] as const;
export type AudioTrackType = (typeof AUDIO_TRACK_TYPES)[number];

/** Track types that carry speech and are eligible to duck other tracks. */
export const SPEECH_TRACK_TYPES: readonly AudioTrackType[] = ['NARRATION', 'DIALOGUE'];

/** Track types that may be ducked by an active speech cue. */
export const DUCKABLE_TRACK_TYPES: readonly AudioTrackType[] = ['AMBIENCE', 'MUSIC'];

export const DEFAULT_DUCKING_AMOUNT_DB = 8;

export type AudioCueLike = {
  id: string;
  enabled: boolean;
  order: number;
  startTimeSeconds: number;
  durationSeconds: number | null;
  trimStartSeconds: number | null;
  trimEndSeconds: number | null;
  volume: number;
  fadeInSeconds: number | null;
  fadeOutSeconds: number | null;
  text: string | null;
  performancePreset: string | null;
  performanceDirection: string | null;
  sequenceSceneId: string | null;
  characterMemoryId: string | null;
  voiceProfileId: string | null;
  audioAssetId: string | null;
  duckingEnabled: boolean;
  duckingAmountDb: number | null;
};

export type AudioTrackLike = {
  id: string;
  type: AudioTrackType;
  name: string;
  enabled: boolean;
  volume: number;
  order: number;
  cues: AudioCueLike[];
};

export type AudioBlueprintCue = {
  cueId: string;
  startTimeSeconds: number;
  endTimeSeconds: number | null;
  trimStartSeconds: number;
  trimEndSeconds: number | null;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  text: string | null;
  performancePreset: string | null;
  performanceDirection: string | null;
  sequenceSceneId: string | null;
  characterMemoryId: string | null;
  voiceProfileId: string | null;
  audioAssetId: string | null;
  // The stable, provider-neutral storage identity resolved AT BLUEPRINT-BUILD
  // TIME from a project-scoped AudioAsset lookup (see `resolvedAudioAssets`
  // below) — never a URL, signed or otherwise. `audioAssetId` and
  // `storageKey` are the canonical snapshot identity; the actual
  // retrievable URL/path is resolved only at render execution time
  // (movieRenderWorker.ts, via getPublicUrlForKey), never persisted here.
  storageKey: string | null;
  duckingEnabled: boolean;
  duckingAmountDb: number | null;
};

/** A pre-validated (already project-scoped) resolved reference to an AudioAsset row — never fetched by this module itself, always supplied by the caller. */
export type ResolvedAudioAssetRef = { storageKey: string };

/**
 * Typed distinction between two very different conditions that must never be
 * conflated:
 *   - a cue with `audioAssetId: null` — plain creative intent, no audio was
 *     ever attached. Expected, common, not an error.
 *   - a cue whose `audioAssetId` was set but could not be resolved within
 *     this project's scope — a supposedly materialized cue pointing at an
 *     invalid/foreign reference. Anomalous: under normal use, write-time
 *     ownership checks (story.ts's assertAudioAssetOwnership) mean this can
 *     only happen via a bug, a migration artifact, or direct DB tampering.
 */
export const AUDIO_ASSET_PROJECT_MISMATCH = 'AUDIO_ASSET_PROJECT_MISMATCH' as const;
export type RejectedAudioAssetReference = {
  cueId: string;
  audioAssetId: string;
  code: typeof AUDIO_ASSET_PROJECT_MISMATCH;
};

export type AudioBlueprintTrack = {
  trackId: string;
  type: AudioTrackType;
  name: string;
  volume: number;
  order: number;
  cues: AudioBlueprintCue[];
};

export type DuckingWindow = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  amountDb: number;
  sourceCueId: string;
};

export type AudioBlueprint = {
  blueprintVersion: string;
  runtimeSeconds: number;
  hasAudio: boolean;
  tracks: AudioBlueprintTrack[];
  duckingWindows: DuckingWindow[];
  // Diagnostic only — every rejected reference already resulted in
  // audioAssetId/storageKey coming back null on its cue (see
  // buildAudioBlueprint), so this field is purely "what happened and why,"
  // never load-bearing for mixing. Deliberately excluded from
  // hashAudioBlueprint's hashed content: it is not part of the creative
  // plan's identity, and a render's reuse/idempotency key must never move
  // just because a rejection was newly detected or newly resolved.
  rejectedAudioAssetReferences: RejectedAudioAssetReference[];
};

function clampVolume(value: unknown, fallback = 1): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(4, Math.max(0, numeric)) * 100) / 100;
}

function clampFade(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(Math.min(10, numeric) * 100) / 100;
}

function clampDuckingAmountDb(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_DUCKING_AMOUNT_DB;
  return Math.round(Math.min(30, numeric) * 10) / 10;
}

/**
 * Builds the deterministic, provider-neutral Audio Blueprint for a plan.
 *
 * Disabled tracks and disabled cues are excluded entirely (required test D).
 * `runtimeSeconds` is always the canonical Film Blueprint runtime, never an
 * independently-derived audio duration — the audio layer fits within the
 * film's timeline, it does not define it (required test E).
 *
 * The returned object is a fresh deep copy: mutating the caller's `tracks`
 * input after this call never changes a previously-returned blueprint
 * (required for render-snapshot immutability, tests J/K).
 *
 * `resolvedAudioAssets` is this function's own defensive layer against a
 * cross-project (or otherwise invalid) `audioAssetId` reaching a cue —
 * required even though the write-time API (story.ts's
 * assertAudioAssetOwnership) already rejects one, because this function must
 * stay safe on its own if a bad row ever gets into AudioCue.audioAssetId by
 * any other path (a bug, a migration artifact, direct DB access). The map
 * must already be project-scoped by the caller (this module does no I/O and
 * trusts nothing about which project the caller resolved it for). Defaults
 * to an empty map: fail closed — no map supplied means no audioAssetId ever
 * resolves.
 *
 * Explicitly NOT the same condition as a cue that never had an audioAssetId:
 *   - `cue.audioAssetId == null`               -> plain unmaterialized intent, silent, not recorded anywhere as a problem.
 *   - `cue.audioAssetId` set but not in the map -> typed rejection, recorded in `rejectedAudioAssetReferences`
 *     (code `AUDIO_ASSET_PROJECT_MISMATCH`) — the cue itself still comes back with `audioAssetId`/`storageKey`
 *     null (never a thrown error here — this function has no request context to throw against), but the fact
 *     that something was rejected, and which cue, is never silently swallowed.
 */
export function buildAudioBlueprint(input: {
  filmBlueprint: Pick<FilmBlueprint, 'runtimeSeconds'>;
  tracks: AudioTrackLike[];
  resolvedAudioAssets?: Map<string, ResolvedAudioAssetRef>;
}): AudioBlueprint {
  const resolvedAudioAssets = input.resolvedAudioAssets ?? new Map<string, ResolvedAudioAssetRef>();
  const rejectedAudioAssetReferences: RejectedAudioAssetReference[] = [];
  const enabledTracks = input.tracks
    .filter((track) => track.enabled)
    .slice()
    .sort((a, b) => a.order - b.order);

  const tracks: AudioBlueprintTrack[] = enabledTracks.map((track) => {
    const enabledCues = track.cues
      .filter((cue) => cue.enabled)
      .slice()
      .sort((a, b) => (a.startTimeSeconds - b.startTimeSeconds) || (a.order - b.order));

    return {
      trackId: track.id,
      type: track.type,
      name: track.name,
      volume: clampVolume(track.volume),
      order: track.order,
      cues: enabledCues.map((cue) => {
        // A cue's audioAssetId only survives into the blueprint if the
        // caller's project-scoped map actually resolved it. Unlike a cue
        // that never had an audioAssetId at all, a SET-but-unresolvable
        // reference is recorded as a typed rejection (see docstring above),
        // not silently downgraded to "no audio" without a trace.
        let resolvedAudioAssetId: string | null = null;
        let storageKey: string | null = null;
        if (cue.audioAssetId) {
          const resolved = resolvedAudioAssets.get(cue.audioAssetId);
          if (resolved) {
            resolvedAudioAssetId = cue.audioAssetId;
            storageKey = resolved.storageKey;
          } else {
            rejectedAudioAssetReferences.push({ cueId: cue.id, audioAssetId: cue.audioAssetId, code: AUDIO_ASSET_PROJECT_MISMATCH });
          }
        }
        return {
          cueId: cue.id,
          startTimeSeconds: Math.max(0, Math.round(cue.startTimeSeconds * 1000) / 1000),
          endTimeSeconds: cue.durationSeconds != null
            ? Math.round((cue.startTimeSeconds + cue.durationSeconds) * 1000) / 1000
            : null,
          trimStartSeconds: Math.max(0, cue.trimStartSeconds ?? 0),
          trimEndSeconds: cue.trimEndSeconds ?? null,
          volume: clampVolume(cue.volume),
          fadeInSeconds: clampFade(cue.fadeInSeconds),
          fadeOutSeconds: clampFade(cue.fadeOutSeconds),
          text: cue.text ?? null,
          performancePreset: cue.performancePreset ?? null,
          performanceDirection: cue.performanceDirection ?? null,
          sequenceSceneId: cue.sequenceSceneId ?? null,
          characterMemoryId: cue.characterMemoryId ?? null,
          voiceProfileId: cue.voiceProfileId ?? null,
          audioAssetId: resolvedAudioAssetId,
          storageKey,
          duckingEnabled: Boolean(cue.duckingEnabled),
          duckingAmountDb: cue.duckingAmountDb != null ? clampDuckingAmountDb(cue.duckingAmountDb) : null,
        };
      }),
    };
  });

  const hasAudio = tracks.some((track) => track.cues.length > 0);
  const duckingWindows = hasAudio ? computeDuckingWindows(tracks) : [];

  return {
    blueprintVersion: AUDIO_BLUEPRINT_VERSION,
    runtimeSeconds: input.filmBlueprint.runtimeSeconds,
    hasAudio,
    tracks,
    duckingWindows,
    rejectedAudioAssetReferences,
  };
}

/**
 * Deterministically derives ducking windows from every enabled speech cue
 * (NARRATION/DIALOGUE) that has duckingEnabled=true. Pure function of cue
 * timing — no randomness, no I/O, no dependency on render/mix order.
 */
export function computeDuckingWindows(tracks: AudioBlueprintTrack[]): DuckingWindow[] {
  const speechCues = tracks
    .filter((track) => SPEECH_TRACK_TYPES.includes(track.type))
    .flatMap((track) => track.cues)
    .filter((cue) => cue.duckingEnabled && cue.endTimeSeconds != null);

  return speechCues
    .map((cue) => ({
      startTimeSeconds: cue.startTimeSeconds,
      endTimeSeconds: cue.endTimeSeconds as number,
      amountDb: cue.duckingAmountDb ?? DEFAULT_DUCKING_AMOUNT_DB,
      sourceCueId: cue.cueId,
    }))
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}

/**
 * Hashes the blueprint's creative-identity content only. Every field this
 * hashes is a stable, deterministic part of the plan itself — cue timing,
 * volume/fade/ducking settings, and the `audioAssetId`/`storageKey` pair
 * (never a resolved URL, signed or otherwise — this module never produces
 * one). `rejectedAudioAssetReferences` is explicitly excluded: it is
 * diagnostic metadata about what failed to resolve, not part of what the
 * creative plan IS, and must never move the render-reuse/idempotency key on
 * its own (a rejection appearing or disappearing between two builds of the
 * same otherwise-unchanged plan must not look like "the plan changed").
 */
export function hashAudioBlueprint(blueprint: AudioBlueprint): string {
  const { rejectedAudioAssetReferences: _omitted, ...hashableBlueprint } = blueprint;
  return crypto.createHash('sha256').update(stableStringify(hashableBlueprint)).digest('hex');
}

/**
 * Combines a visual renderPlanHash with an Audio Blueprint hash so that
 * changing ONLY the audio plan still produces a different render-reuse key
 * — otherwise a stale visual-only render could be silently "reused" after
 * the audio changed. When `audioBlueprint` is null/has no audio, returns
 * `renderPlanHash` completely unchanged, preserving the exact pre-Phase-9B.2
 * hash for every silent film (zero behavior change for existing renders).
 */
export function combineRenderHash(renderPlanHash: string, audioBlueprint: AudioBlueprint | null): string {
  if (!audioBlueprint || !audioBlueprint.hasAudio) return renderPlanHash;
  return crypto.createHash('sha256').update(`${renderPlanHash}:${hashAudioBlueprint(audioBlueprint)}`).digest('hex');
}

export function nextAudioVersionFromExisting(versions: Array<{ versionNumber?: number | null }>): number {
  const maxVersion = versions.reduce((max, version) => {
    const numeric = Number(version.versionNumber);
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return maxVersion + 1;
}

/**
 * R16-safe projection of an Audio Blueprint. Strips every creator/technical
 * field: no voice profile ids, no character links, no cue text, no
 * performance direction, no track/cue ids, no ducking parameters, no
 * blueprint version string. Returns only what a simplified consumer playback
 * experience could ever need — currently nothing, since Phase 9B.2 does not
 * ship R16 audio playback (guardrail: no Audio Workspace creator controls in
 * R16). Kept as an explicit function (rather than "just don't send it") so
 * the exclusion is a visible, testable contract, not an accident of what a
 * caller forgot to include.
 */
export function toR16SafeAudioSummary(_blueprint: AudioBlueprint | null): Record<string, never> {
  return {};
}

/**
 * True when a cue's start/duration is compatible with an ancestor Film
 * Blueprint's declared shot timeline — used only for optional UI hinting,
 * never for a hard write-time constraint (a cue may legitimately span
 * multiple shots, e.g. music or ambience).
 */
export function isWithinCanonicalTimeline(cue: { startTimeSeconds: number }, filmBlueprintRuntimeSeconds: number): boolean {
  return cue.startTimeSeconds >= 0 && cue.startTimeSeconds <= filmBlueprintRuntimeSeconds;
}

/**
 * Product decision (Phase 9B.2B, documented in
 * docs/architecture/audio-performance-layer.md): a NARRATION/DIALOGUE cue's
 * `text`/`voiceProfileId`/`performanceDirection` are pure CREATIVE INTENT —
 * they never imply rendered audio exists. A cue only contributes bytes to a
 * render once it has a resolved `audioAssetId` (materialized media). No TTS
 * provider exists yet, so intent-without-media is an expected, common state,
 * not an error — the render worker already silently omits such cues rather
 * than faking speech or blocking (see movieRenderWorker.ts's `cuesWithSource`
 * filter). This is WARNING severity, not BLOCKER: unmaterialized cues never
 * prevent a render, they just don't sound in it. This function exists so
 * that state is surfaced honestly to the creator instead of silently
 * dropped — used by the Movie Builder preflight (getMovieBuilder).
 */
export function summarizeUnmaterializedSpeechCues(blueprint: AudioBlueprint | null): { count: number; message: string | null } {
  if (!blueprint) return { count: 0, message: null };
  // Deliberately excludes cues present in rejectedAudioAssetReferences — a
  // rejected (typed-mismatch) cue is NOT the same condition as one that
  // simply never had an asset attached, and gets its own distinct signal
  // rather than being folded into this "expected, common" message.
  const rejectedCueIds = new Set(blueprint.rejectedAudioAssetReferences.map((r) => r.cueId));
  const count = blueprint.tracks
    .filter((track) => SPEECH_TRACK_TYPES.includes(track.type))
    .reduce((sum, track) => sum + track.cues.filter((cue) => !cue.audioAssetId && !rejectedCueIds.has(cue.cueId)).length, 0);
  if (count === 0) return { count: 0, message: null };
  const noun = count === 1 ? 'cue' : 'cues';
  return { count, message: `${count} narration/dialogue ${noun} don't have audio yet — they'll be skipped in the render.` };
}

export { computeCanonicalShotTimeline };
