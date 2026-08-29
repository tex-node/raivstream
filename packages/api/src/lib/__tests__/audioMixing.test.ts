import { describe, expect, it } from 'vitest';
import {
  AUDIO_DURATION_TOLERANCE_SECONDS,
  assertAudioReadyGate,
  buildMixFilterGraph,
  buildNormalizeArgs,
  probeAudioAsset,
  probeAudioStream,
  type AudioProbe,
  type ResolvedCueSource,
} from '../audioMixing';
import type { AudioBlueprintCue, DuckingWindow } from '../audioPlanning';

const CANONICAL_RUNTIME = 12; // stand-in Film Blueprint runtime shared by every fixture below

function speechCue(overrides: Partial<AudioBlueprintCue> = {}): AudioBlueprintCue {
  return {
    cueId: 'cue-1', startTimeSeconds: 0, endTimeSeconds: 2, trimStartSeconds: 0, trimEndSeconds: null,
    volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null,
    sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null, storageKey: null,
    duckingEnabled: false, duckingAmountDb: null,
    ...overrides,
  };
}

describe('buildMixFilterGraph', () => {
  it('is deterministic — identical input produces identical output every time', () => {
    const sources: ResolvedCueSource[] = [
      { cue: speechCue({ cueId: 'a', startTimeSeconds: 0 }), trackType: 'NARRATION', trackVolume: 1, filePath: '/tmp/a.wav' },
      { cue: speechCue({ cueId: 'b', startTimeSeconds: 3, fadeInSeconds: 0.5 }), trackType: 'MUSIC', trackVolume: 0.6, filePath: '/tmp/b.wav' },
    ];
    const first = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
    const second = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
    expect(first).toEqual(second);
  });

  it('single cue: no amix stage needed, direct pass-through of one filter chain into the canonical-runtime pad/trim', () => {
    const sources: ResolvedCueSource[] = [
      { cue: speechCue(), trackType: 'NARRATION', trackVolume: 1, filePath: '/tmp/a.wav' },
    ];
    const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
    expect(graph.filterComplex).not.toContain('amix');
    expect(graph.inputFiles).toEqual(['/tmp/a.wav']);
    expect(graph.outputLabel).toBe('[final]');
  });

  it('multiple cues: mixes via amix with one input per cue and applies the safety limiter', () => {
    const sources: ResolvedCueSource[] = [
      { cue: speechCue({ cueId: 'a' }), trackType: 'NARRATION', trackVolume: 1, filePath: '/tmp/a.wav' },
      { cue: speechCue({ cueId: 'b', startTimeSeconds: 1 }), trackType: 'SFX', trackVolume: 1, filePath: '/tmp/b.wav' },
      { cue: speechCue({ cueId: 'c', startTimeSeconds: 2 }), trackType: 'MUSIC', trackVolume: 0.5, filePath: '/tmp/c.wav' },
    ];
    const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
    expect(graph.filterComplex).toContain('amix=inputs=3');
    expect(graph.filterComplex).toContain('alimiter=limit=0.95');
    expect(graph.inputFiles).toHaveLength(3);
  });

  it('applies ducking only to AMBIENCE/MUSIC cues whose window overlaps, never to NARRATION/DIALOGUE/SFX', () => {
    const window: DuckingWindow = { startTimeSeconds: 0, endTimeSeconds: 2, amountDb: 8, sourceCueId: 'dialogue-1' };
    const sources: ResolvedCueSource[] = [
      { cue: speechCue({ cueId: 'music-overlap', startTimeSeconds: 0, endTimeSeconds: 5 }), trackType: 'MUSIC', trackVolume: 1, filePath: '/tmp/music.wav' },
      { cue: speechCue({ cueId: 'sfx-not-duckable', startTimeSeconds: 0, endTimeSeconds: 1 }), trackType: 'SFX', trackVolume: 1, filePath: '/tmp/sfx.wav' },
    ];
    const graph = buildMixFilterGraph(sources, [window], CANONICAL_RUNTIME);
    // The MUSIC chain gets a ducking volume filter; the SFX chain never does.
    const musicChainIdx = graph.filterComplex.indexOf('c0');
    const sfxChainIdx = graph.filterComplex.indexOf('c1');
    expect(graph.filterComplex).toContain("between(t,0,2)");
    expect(graph.filterComplex.slice(musicChainIdx, sfxChainIdx)).toContain('enable=');
  });

  it('applies fade-out relative to the cue end time, clamped to not precede the cue start', () => {
    const sources: ResolvedCueSource[] = [
      { cue: speechCue({ startTimeSeconds: 1, endTimeSeconds: 2, fadeOutSeconds: 5 }), trackType: 'MUSIC', trackVolume: 1, filePath: '/tmp/a.wav' },
    ];
    const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
    // fadeOutSeconds (5) is longer than the cue itself (1s) — the fade start
    // must clamp to the cue's own startTimeSeconds, not go negative.
    expect(graph.filterComplex).toContain('afade=t=out:st=1:d=5');
  });

  // --- Canonical-runtime invariant -----------------------------------------
  // "Film Blueprint runtime = Audio Blueprint runtime = final movie runtime."
  // Every one of these fixtures represents one required pure-rendering
  // checkpoint scenario. In every case the graph must end by forcing the
  // merged stream to exactly CANONICAL_RUNTIME via apad + atrim, regardless
  // of how the individual cues are placed.
  describe('canonical-runtime enforcement (pure-rendering checkpoint fixtures)', () => {
    function expectsForcedToCanonicalRuntime(filterComplex: string, outputLabel: string) {
      expect(outputLabel).toBe('[final]');
      expect(filterComplex).toContain(`apad=whole_dur=${CANONICAL_RUNTIME}`);
      expect(filterComplex).toContain(`atrim=start=0:end=${CANONICAL_RUNTIME}`);
      // The pad/trim stage must be the last thing applied to the merged stream.
      expect(filterComplex.trim().endsWith('[final]')).toBe(true);
    }

    it('speech only — a single NARRATION cue spanning the whole runtime', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'narr', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME }), trackType: 'NARRATION', trackVolume: 1, filePath: '/tmp/narr.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('ambience + SFX — two non-speech cues mixed together', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'amb', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME }), trackType: 'AMBIENCE', trackVolume: 0.7, filePath: '/tmp/amb.wav' },
        { cue: speechCue({ cueId: 'sfx', startTimeSeconds: 5, endTimeSeconds: 5.5 }), trackType: 'SFX', trackVolume: 1, filePath: '/tmp/sfx.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain('amix=inputs=2');
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('music + speech ducking — MUSIC dips under an overlapping DIALOGUE window', () => {
      const window: DuckingWindow = { startTimeSeconds: 2, endTimeSeconds: 6, amountDb: 10, sourceCueId: 'dlg' };
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'music', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME }), trackType: 'MUSIC', trackVolume: 1, filePath: '/tmp/music.wav' },
        { cue: speechCue({ cueId: 'dlg', startTimeSeconds: 2, endTimeSeconds: 6, duckingEnabled: true, duckingAmountDb: 10 }), trackType: 'DIALOGUE', trackVolume: 1, filePath: '/tmp/dlg.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [window], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain("between(t,2,6)");
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('overlapping cues — two DIALOGUE cues whose time ranges overlap', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'a', startTimeSeconds: 1, endTimeSeconds: 5 }), trackType: 'DIALOGUE', trackVolume: 1, filePath: '/tmp/a.wav' },
        { cue: speechCue({ cueId: 'b', startTimeSeconds: 3, endTimeSeconds: 7 }), trackType: 'DIALOGUE', trackVolume: 1, filePath: '/tmp/b.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain('adelay=1000|1000');
      expect(graph.filterComplex).toContain('adelay=3000|3000');
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('fade in/out — a MUSIC cue with both a fade-in and a fade-out', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'music', startTimeSeconds: 0, endTimeSeconds: CANONICAL_RUNTIME, fadeInSeconds: 1, fadeOutSeconds: 2 }), trackType: 'MUSIC', trackVolume: 1, filePath: '/tmp/music.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain('afade=t=in:st=0:d=1');
      expect(graph.filterComplex).toContain(`afade=t=out:st=${CANONICAL_RUNTIME - 2}:d=2`);
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('late-starting cue — a single SFX cue that starts well after t=0 and ends before the runtime', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'sfx', startTimeSeconds: 10, endTimeSeconds: 10.5 }), trackType: 'SFX', trackVolume: 1, filePath: '/tmp/sfx.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain('adelay=10000|10000');
      // This is exactly the case that previously broke: a single short,
      // late cue with no amix stage must still be padded out to the full
      // canonical runtime, not left at ~0.5s.
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('delayed start is preserved, not collapsed into "runtime minus start" — an 8s-start cue in a 12s film ends at atrim=...:end=12, never end=4', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'late', startTimeSeconds: 8, endTimeSeconds: 9 }), trackType: 'SFX', trackVolume: 1, filePath: '/tmp/late.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      expect(graph.filterComplex).toContain('adelay=8000|8000');
      // The naive/wrong reading of "pad to fill the remaining time after the
      // cue" would produce a (12-8)=4s output. The correct reading — pad the
      // whole merged stream, from t=0, out to the full canonical runtime —
      // must produce atrim=start=0:end=12, not end=4.
      expect(graph.filterComplex).toContain(`atrim=start=0:end=${CANONICAL_RUNTIME}`);
      expect(graph.filterComplex).not.toContain('atrim=start=0:end=4');
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });

    it('early-ending cue — a single NARRATION cue that ends long before the runtime', () => {
      const sources: ResolvedCueSource[] = [
        { cue: speechCue({ cueId: 'narr', startTimeSeconds: 0, endTimeSeconds: 2 }), trackType: 'NARRATION', trackVolume: 1, filePath: '/tmp/narr.wav' },
      ];
      const graph = buildMixFilterGraph(sources, [], CANONICAL_RUNTIME);
      // Regression guard for the exact bug this checkpoint fixes: a 2s cue on
      // a 12s runtime must produce a 12s mixed track, not a 2s one — amix's
      // own duration=longest never even runs here (single-cue path), so the
      // apad/atrim stage is the only thing standing between this scenario and
      // a truncated final movie.
      expectsForcedToCanonicalRuntime(graph.filterComplex, graph.outputLabel);
    });
  });
});

describe('buildNormalizeArgs', () => {
  it('produces deterministic canonical-format args regardless of input extension', () => {
    const args = buildNormalizeArgs('/tmp/in.mp3', '/tmp/out.wav');
    expect(args).toEqual(['-y', '-i', '/tmp/in.mp3', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '/tmp/out.wav']);
  });
});

describe('probeAudioAsset / probeAudioStream', () => {
  it('probeAudioAsset and probeAudioStream are the same deterministic ffprobe call under two names', async () => {
    const run = async () => ({
      stdout: JSON.stringify({ streams: [{ codec_name: 'pcm_s16le', sample_rate: '44100', channels: 2, duration: '3.500000' }] }),
    });
    const assetProbe = await probeAudioAsset('/tmp/source.wav', run);
    const streamProbe = await probeAudioStream('/tmp/source.wav', run);
    expect(assetProbe).toEqual(streamProbe);
    expect(assetProbe).toEqual({ hasAudioStream: true, codec: 'pcm_s16le', sampleRateHz: 44100, channels: 2, durationSeconds: 3.5 });
  });

  it('parses a valid AAC stream from ffprobe JSON', async () => {
    const run = async () => ({
      stdout: JSON.stringify({ streams: [{ codec_name: 'aac', sample_rate: '44100', channels: 2, duration: '6.000000' }] }),
    });
    const probe = await probeAudioStream('/tmp/out.mp4', run);
    expect(probe).toEqual({ hasAudioStream: true, codec: 'aac', sampleRateHz: 44100, channels: 2, durationSeconds: 6 });
  });

  it('reports hasAudioStream=false when ffprobe finds no audio stream', async () => {
    const run = async () => ({ stdout: JSON.stringify({ streams: [] }) });
    const probe = await probeAudioStream('/tmp/silent.mp4', run);
    expect(probe.hasAudioStream).toBe(false);
  });
});

describe('assertAudioReadyGate', () => {
  const goodProbe: AudioProbe = { hasAudioStream: true, codec: 'aac', sampleRateHz: 44100, channels: 2, durationSeconds: 6 };

  it('uses the same 0.25s tolerance as the video pipeline (not a separately-invented looser one)', () => {
    expect(AUDIO_DURATION_TOLERANCE_SECONDS).toBe(0.25);
  });

  // Required test L — output with expected audio but missing stream cannot become READY.
  it('throws OUTPUT_AUDIO_STREAM_MISSING when audio was expected but the output has no audio stream', () => {
    const missingProbe: AudioProbe = { hasAudioStream: false, codec: null, sampleRateHz: null, channels: null, durationSeconds: null };
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: missingProbe, expectedVideoDurationSeconds: 6 }))
      .toThrow('OUTPUT_AUDIO_STREAM_MISSING');
  });

  // Required test M — silent movie remains READY when no audio was expected.
  it('never throws when no audio was expected, even given a garbage/empty probe', () => {
    const garbageProbe: AudioProbe = { hasAudioStream: false, codec: null, sampleRateHz: null, channels: null, durationSeconds: null };
    expect(() => assertAudioReadyGate({ expectedAudio: false, probe: garbageProbe, expectedVideoDurationSeconds: 6 })).not.toThrow();
  });

  it('passes for a valid audio stream matching the video duration', () => {
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: goodProbe, expectedVideoDurationSeconds: 6 })).not.toThrow();
  });

  it('rejects a codec other than the mix output codec', () => {
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: { ...goodProbe, codec: 'mp3' }, expectedVideoDurationSeconds: 6 }))
      .toThrow('OUTPUT_AUDIO_VERIFICATION_FAILED');
  });

  it('rejects an audio duration incompatible with the video duration beyond the 0.25s tolerance', () => {
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: { ...goodProbe, durationSeconds: 2 }, expectedVideoDurationSeconds: 6 }))
      .toThrow('OUTPUT_AUDIO_VERIFICATION_FAILED');
  });

  it('accepts a small audio duration delta within the 0.25s tolerance', () => {
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: { ...goodProbe, durationSeconds: 6.2 }, expectedVideoDurationSeconds: 6 })).not.toThrow();
  });

  it('rejects a delta just outside the 0.25s tolerance', () => {
    expect(() => assertAudioReadyGate({ expectedAudio: true, probe: { ...goodProbe, durationSeconds: 6.3 }, expectedVideoDurationSeconds: 6 }))
      .toThrow('OUTPUT_AUDIO_VERIFICATION_FAILED');
  });
});
