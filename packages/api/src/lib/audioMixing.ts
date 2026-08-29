/**
 * FFmpeg audio mixing for the Phase 9B.2 Audio & Performance layer.
 *
 * Mirrors the CommandRunner-injection pattern already established in
 * movieRenderWorker.ts (including its local test convention — a mocked
 * runner locally, real `ffmpeg`/`ffprobe` binaries only where actually
 * installed, i.e. the VPS staging/production host). Nothing here invents a
 * new execution model.
 *
 * Two-stage pipeline, mirroring the existing render-shots → assemble
 * precedent:
 *   1. buildMixedAudioTrack — mixes every enabled cue (with trim/delay/
 *      volume/fade/ducking) down to one AAC file via a single filter_complex
 *      graph.
 *   2. muxAudioWithVideo — stream-copies the existing silent H.264 MP4 and
 *      the mixed AAC track together. The visual encode is never re-touched.
 *
 * Conservative, deterministic output normalization only (an `alimiter`
 * safety ceiling) — no loudness-matching/mastering, per brief §24.
 */
import type { AudioBlueprint, AudioBlueprintCue, AudioBlueprintTrack, DuckingWindow } from './audioPlanning';
import { DUCKABLE_TRACK_TYPES } from './audioPlanning';
import { MOVIE_RENDER_DURATION_TOLERANCE_SECONDS, durationWithinTolerance } from './movieRenderPlanning';

export type CommandResult = void | { stdout?: string; stderr?: string };
export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export const AUDIO_MIX_DEFAULTS = {
  sampleRateHz: 44100,
  channels: 2,
  audioCodec: 'aac',
  audioBitrate: '128k',
  limiterCeiling: 0.95,
} as const;

/** Canonical intermediate format every input is normalized to before mixing math is applied. */
export const AUDIO_NORMALIZE_DEFAULTS = {
  sampleRateHz: 44100,
  channels: 2,
  codec: 'pcm_s16le',
} as const;

/**
 * Same tolerance the video pipeline already uses (`movieRenderPlanning.ts`),
 * reused rather than reinvented so "Film Blueprint runtime = Audio Blueprint
 * runtime = final movie runtime" is checked to one consistent standard across
 * both the video-only and audio-bearing paths. Safe to tighten from the
 * previous 0.5s default now that the mixed track is force-padded/trimmed to
 * the exact canonical runtime (see buildMixFilterGraph) instead of being
 * left at whatever length the longest cue happened to produce.
 */
export const AUDIO_DURATION_TOLERANCE_SECONDS = MOVIE_RENDER_DURATION_TOLERANCE_SECONDS;

export type AudioProbe = {
  hasAudioStream: boolean;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  durationSeconds: number | null;
};

export type ResolvedCueSource = {
  cue: AudioBlueprintCue;
  trackType: AudioBlueprintTrack['type'];
  trackVolume: number;
  /** Local filesystem path to this cue's decoded source audio. Must already be normalized (see normalizeAudioInput) before this is passed to buildMixedAudioTrack. */
  filePath: string;
};

/**
 * Deterministic input-asset probing. Same underlying ffprobe invocation as
 * probeAudioStream (output verification), kept as a distinctly-named export
 * because the two are conceptually different pipeline stages with different
 * call sites — this one runs once per downloaded AudioAsset, before any
 * mixing happens, so a corrupt/zero-duration/unreadable source fails fast
 * with a clear cue-level error instead of surfacing as a confusing mix or
 * mux failure later.
 */
export const probeAudioAsset = probeAudioStreamImpl;

function dbToLinearGain(db: number): number {
  return Math.round(Math.pow(10, -db / 20) * 1000) / 1000;
}

/**
 * Normalizes one raw input file (arbitrary container/codec/sample
 * rate/channel layout) to the canonical intermediate PCM format every mixing
 * calculation assumes. Without this, ffmpeg's filter graph still *works*
 * (it auto-inserts aresample/aformat at convergence points like amix), but
 * the exact sample-accurate behavior of atrim/adelay across inputs of
 * different native sample rates is not guaranteed deterministic across
 * ffmpeg builds — normalizing first makes every downstream trim/delay/fade
 * computation operate on identically-shaped audio, which is what makes the
 * mix filter graph a pure, reproducible function of the Audio Blueprint.
 */
export function buildNormalizeArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i', inputPath,
    '-ar', String(AUDIO_NORMALIZE_DEFAULTS.sampleRateHz),
    '-ac', String(AUDIO_NORMALIZE_DEFAULTS.channels),
    '-c:a', AUDIO_NORMALIZE_DEFAULTS.codec,
    outputPath,
  ];
}

export async function normalizeAudioInput(input: { inputPath: string; outputPath: string; run: CommandRunner }): Promise<void> {
  await input.run('ffmpeg', buildNormalizeArgs(input.inputPath, input.outputPath));
}

function windowsOverlappingCue(cue: AudioBlueprintCue, windows: DuckingWindow[]): DuckingWindow[] {
  const cueEnd = cue.endTimeSeconds ?? Number.POSITIVE_INFINITY;
  return windows.filter((w) => w.startTimeSeconds < cueEnd && w.endTimeSeconds > cue.startTimeSeconds);
}

/**
 * Builds one cue's filter chain: trim → delay-to-canonical-start → base
 * volume → ducking windows (duckable tracks only) → fades. Returns the
 * filter_complex fragment and the label of its output stream.
 */
export function buildCueFilterChain(
  source: ResolvedCueSource,
  inputIndex: number,
  label: string,
  duckingWindows: DuckingWindow[],
): { filter: string; outputLabel: string } {
  const { cue, trackType, trackVolume } = source;
  const parts: string[] = [];
  let stream = `[${inputIndex}:a]`;

  const trimStart = Math.max(0, cue.trimStartSeconds ?? 0);
  const trimArgs = cue.trimEndSeconds != null ? `start=${trimStart}:end=${cue.trimEndSeconds}` : `start=${trimStart}`;
  parts.push(`${stream}atrim=${trimArgs},asetpts=PTS-STARTPTS[${label}t]`);
  stream = `[${label}t]`;

  const delayMs = Math.max(0, Math.round(cue.startTimeSeconds * 1000));
  parts.push(`${stream}adelay=${delayMs}|${delayMs}[${label}d]`);
  stream = `[${label}d]`;

  const baseVolume = Math.max(0, Math.round(cue.volume * trackVolume * 1000) / 1000);
  parts.push(`${stream}volume=${baseVolume}[${label}v]`);
  stream = `[${label}v]`;

  // Deterministic ducking: only AMBIENCE/MUSIC cues are ever ducked, and only
  // for the windows that actually overlap this cue's own time range.
  if (DUCKABLE_TRACK_TYPES.includes(trackType)) {
    const applicable = windowsOverlappingCue(cue, duckingWindows);
    applicable.forEach((window, i) => {
      const gain = dbToLinearGain(window.amountDb);
      const nextLabel = `${label}dk${i}`;
      parts.push(`${stream}volume=enable='between(t,${window.startTimeSeconds},${window.endTimeSeconds})':volume=${gain}[${nextLabel}]`);
      stream = `[${nextLabel}]`;
    });
  }

  if (cue.fadeInSeconds > 0) {
    parts.push(`${stream}afade=t=in:st=${cue.startTimeSeconds}:d=${cue.fadeInSeconds}[${label}fi]`);
    stream = `[${label}fi]`;
  }
  if (cue.fadeOutSeconds > 0 && cue.endTimeSeconds != null) {
    const fadeStart = Math.max(cue.startTimeSeconds, cue.endTimeSeconds - cue.fadeOutSeconds);
    parts.push(`${stream}afade=t=out:st=${fadeStart}:d=${cue.fadeOutSeconds}[${label}fo]`);
    stream = `[${label}fo]`;
  }

  return { filter: parts.join(';'), outputLabel: stream };
}

/**
 * Builds the complete filter_complex graph + input file order for mixing
 * every resolved cue down to one master stream. Pure string-building, no I/O
 * — testable without invoking ffmpeg (mirrors buildMovieRenderPlan's own
 * pure-planning style).
 *
 * The final stage always forces the merged stream to exactly
 * `canonicalRuntimeSeconds` via `apad` (silence-pad if shorter) then `atrim`
 * (cut if longer) — this is the single place the core invariant is enforced:
 *
 *   Film Blueprint runtime == Audio Blueprint runtime == final movie runtime
 *
 * A cue may start late, end early, overlap, fade, or duck; none of that may
 * change how long the mixed track is. Without this stage, `amix`'s own
 * `duration=longest` only reaches the longest *cue*, not the canonical
 * runtime — a single short speech cue on a long silent runtime would
 * previously produce a short mix, and `muxAudioWithVideo`'s `-shortest`
 * would then truncate the final video below the Film Blueprint runtime.
 * This stage runs even for a single cue (no amix), which is exactly the
 * case that bug hit hardest.
 */
export function buildMixFilterGraph(
  sources: ResolvedCueSource[],
  duckingWindows: DuckingWindow[],
  canonicalRuntimeSeconds: number,
): {
  inputFiles: string[];
  filterComplex: string;
  outputLabel: string;
} {
  const inputFiles = sources.map((s) => s.filePath);
  const chains = sources.map((source, index) => buildCueFilterChain(source, index, `c${index}`, duckingWindows));

  if (chains.length === 0) {
    return { inputFiles, filterComplex: '', outputLabel: '' };
  }

  const runtime = Math.max(0, Math.round(canonicalRuntimeSeconds * 1000) / 1000);
  const parts = chains.map((c) => c.filter);
  let mergedLabel: string;

  if (chains.length === 1) {
    mergedLabel = chains[0].outputLabel;
  } else {
    const mixInputs = chains.map((c) => c.outputLabel).join('');
    parts.push(`${mixInputs}amix=inputs=${chains.length}:duration=longest:dropout_transition=0,alimiter=limit=${AUDIO_MIX_DEFAULTS.limiterCeiling}[mixed]`);
    mergedLabel = '[mixed]';
  }

  parts.push(`${mergedLabel}apad=whole_dur=${runtime},atrim=start=0:end=${runtime},asetpts=PTS-STARTPTS[final]`);

  return { inputFiles, filterComplex: parts.join(';'), outputLabel: '[final]' };
}

/**
 * Real FFmpeg invocation: mixes all resolved cues down to one AAC file whose
 * duration is exactly `canonicalRuntimeSeconds` (see buildMixFilterGraph).
 * `run` is always caller-injected (CommandRunner), matching the existing
 * movieRenderWorker.ts convention — local tests inject a mock, staging/prod
 * inject the real spawn-based runner.
 */
export async function buildMixedAudioTrack(input: {
  sources: ResolvedCueSource[];
  duckingWindows: DuckingWindow[];
  canonicalRuntimeSeconds: number;
  outputPath: string;
  run: CommandRunner;
}): Promise<void> {
  const { inputFiles, filterComplex, outputLabel } = buildMixFilterGraph(input.sources, input.duckingWindows, input.canonicalRuntimeSeconds);
  if (inputFiles.length === 0) throw new Error('buildMixedAudioTrack called with zero cue sources');

  const args: string[] = ['-y'];
  for (const file of inputFiles) args.push('-i', file);

  if (filterComplex) {
    args.push('-filter_complex', filterComplex, '-map', outputLabel);
  } else {
    args.push('-map', '0:a');
  }

  args.push(
    '-ar', String(AUDIO_MIX_DEFAULTS.sampleRateHz),
    '-ac', String(AUDIO_MIX_DEFAULTS.channels),
    '-c:a', AUDIO_MIX_DEFAULTS.audioCodec,
    '-b:a', AUDIO_MIX_DEFAULTS.audioBitrate,
    input.outputPath,
  );

  await input.run('ffmpeg', args);
}

/** Stream-copies the silent video and the mixed audio track together. Never re-encodes video. */
export async function muxAudioWithVideo(input: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  run: CommandRunner;
}): Promise<void> {
  await input.run('ffmpeg', [
    '-y',
    '-i', input.videoPath,
    '-i', input.audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-shortest',
    input.outputPath,
  ]);
}

/** Audio-specific FFprobe verification. Extends, never replaces, the existing video probeMovie(). */
export async function probeAudioStreamImpl(filePath: string, run: CommandRunner): Promise<AudioProbe> {
  const result = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels,duration',
    '-of', 'json',
    filePath,
  ]);
  const raw = result && typeof result === 'object' && 'stdout' in result ? result.stdout ?? '' : '';
  const parsed = raw ? JSON.parse(raw) : {};
  const stream = parsed.streams?.[0];
  if (!stream) {
    return { hasAudioStream: false, codec: null, sampleRateHz: null, channels: null, durationSeconds: null };
  }
  return {
    hasAudioStream: true,
    codec: String(stream.codec_name ?? ''),
    sampleRateHz: Number.isFinite(Number(stream.sample_rate)) ? Number(stream.sample_rate) : null,
    channels: Number.isFinite(Number(stream.channels)) ? Number(stream.channels) : null,
    durationSeconds: Number.isFinite(Number(stream.duration)) ? Number(stream.duration) : null,
  };
}

/** Public name used at output-verification call sites (post-mix). Same implementation as probeAudioAsset (input probing) — see that export's docstring for why they're named separately. */
export const probeAudioStream = probeAudioStreamImpl;

/**
 * The audio READY gate. If the Audio Blueprint expected audio and the output
 * has no valid audio stream, this throws OUTPUT_AUDIO_STREAM_MISSING — the
 * render must never reach READY in that case. If no audio was expected,
 * returns immediately (silent films are unaffected, required test M).
 */
export function assertAudioReadyGate(input: {
  expectedAudio: boolean;
  probe: AudioProbe;
  expectedVideoDurationSeconds: number;
}): void {
  if (!input.expectedAudio) return;

  if (!input.probe.hasAudioStream) {
    throw new Error('OUTPUT_AUDIO_STREAM_MISSING: Audio Blueprint expected an audio track but the rendered output has none.');
  }
  if (input.probe.codec !== AUDIO_MIX_DEFAULTS.audioCodec) {
    throw new Error(`OUTPUT_AUDIO_VERIFICATION_FAILED: expected ${AUDIO_MIX_DEFAULTS.audioCodec} codec, got ${input.probe.codec}`);
  }
  if (!input.probe.sampleRateHz || input.probe.sampleRateHz <= 0) {
    throw new Error('OUTPUT_AUDIO_VERIFICATION_FAILED: invalid sample rate');
  }
  if (!input.probe.channels || input.probe.channels <= 0) {
    throw new Error('OUTPUT_AUDIO_VERIFICATION_FAILED: invalid channel count');
  }
  if (input.probe.durationSeconds == null) {
    throw new Error('OUTPUT_AUDIO_VERIFICATION_FAILED: missing audio duration');
  }
  const durationCheck = durationWithinTolerance({
    expectedSeconds: input.expectedVideoDurationSeconds,
    actualSeconds: input.probe.durationSeconds,
    toleranceSeconds: AUDIO_DURATION_TOLERANCE_SECONDS,
  });
  if (!durationCheck.ok) {
    throw new Error(`OUTPUT_AUDIO_VERIFICATION_FAILED: audio duration ${input.probe.durationSeconds}s incompatible with video duration ${input.expectedVideoDurationSeconds}s (delta ${durationCheck.durationDeltaSeconds}s)`);
  }
}
