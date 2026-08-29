import { describe, expect, it } from 'vitest';
import {
  buildAudioBlueprint,
  combineRenderHash,
  computeDuckingWindows,
  hashAudioBlueprint,
  nextAudioVersionFromExisting,
  summarizeUnmaterializedSpeechCues,
  toR16SafeAudioSummary,
  type AudioTrackLike,
  type AudioBlueprintTrack,
} from '../audioPlanning';
import { computeCanonicalShotTimeline, buildFilmBlueprint } from '../sequencePlanning';

function cue(overrides: Partial<AudioTrackLike['cues'][number]> = {}): AudioTrackLike['cues'][number] {
  return {
    id: 'cue-1',
    enabled: true,
    order: 0,
    startTimeSeconds: 0,
    durationSeconds: 2,
    trimStartSeconds: null,
    trimEndSeconds: null,
    volume: 1,
    fadeInSeconds: null,
    fadeOutSeconds: null,
    text: null,
    performancePreset: null,
    performanceDirection: null,
    sequenceSceneId: null,
    characterMemoryId: null,
    voiceProfileId: null,
    audioAssetId: null,
    duckingEnabled: false,
    duckingAmountDb: null,
    ...overrides,
  };
}

function track(overrides: Partial<AudioTrackLike> = {}): AudioTrackLike {
  return {
    id: 'track-1',
    type: 'MUSIC',
    name: 'Music',
    enabled: true,
    volume: 1,
    order: 0,
    cues: [],
    ...overrides,
  };
}

const FILM_BLUEPRINT = { runtimeSeconds: 12 };

describe('canonical shot timeline (Film Blueprint)', () => {
  // Required test B — cue timing must be deterministic and derived from the
  // canonical (non-transition-adjusted) shot timeline, matching the brief's
  // own worked example: 0-2, 2-4, 4-6.
  it('derives cumulative canonical start times from durationSeconds, not render/xfade handles', () => {
    const blueprint = buildFilmBlueprint({
      sequenceId: 'seq-1',
      version: 1,
      scenes: [
        { id: 's1', storySceneId: 'ss1', orderIndex: 1, enabled: true, durationSeconds: 2, transition: 'CUT', transitionDurationSeconds: 0 },
        { id: 's2', storySceneId: 'ss2', orderIndex: 2, enabled: true, durationSeconds: 2, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 1.5 },
        { id: 's3', storySceneId: 'ss3', orderIndex: 3, enabled: true, durationSeconds: 2, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 1.5 },
      ],
    });
    const timeline = computeCanonicalShotTimeline(blueprint);
    expect(timeline.map((t) => [t.startTimeSeconds, t.endTimeSeconds])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
    // The heavy transitionDurationSeconds (1.5s) must NOT shrink or grow the
    // canonical timeline — only render-time xfade handles use that value.
    expect(timeline[timeline.length - 1].endTimeSeconds).toBe(blueprint.runtimeSeconds);
  });

  it('excludes disabled shots and does not shift disabled-shot ids into the timeline', () => {
    const blueprint = buildFilmBlueprint({
      sequenceId: 'seq-1',
      version: 1,
      scenes: [
        { id: 's1', storySceneId: 'ss1', orderIndex: 1, enabled: true, durationSeconds: 3 },
        { id: 's2', storySceneId: 'ss2', orderIndex: 2, enabled: false, durationSeconds: 100 },
        { id: 's3', storySceneId: 'ss3', orderIndex: 3, enabled: true, durationSeconds: 3 },
      ],
    });
    const timeline = computeCanonicalShotTimeline(blueprint);
    expect(timeline.map((t) => t.sequenceSceneId)).toEqual(['s1', 's3']);
    expect(timeline[1].startTimeSeconds).toBe(3);
  });
});

describe('buildAudioBlueprint', () => {
  // Required test D — disabled cues/tracks excluded.
  it('excludes disabled tracks and disabled cues entirely', () => {
    const tracks: AudioTrackLike[] = [
      track({ id: 't-narration', type: 'NARRATION', enabled: true, cues: [cue({ id: 'c1', enabled: true }), cue({ id: 'c2', enabled: false })] }),
      track({ id: 't-sfx', type: 'SFX', enabled: false, cues: [cue({ id: 'c3', enabled: true })] }),
    ];
    const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks });
    expect(blueprint.tracks).toHaveLength(1);
    expect(blueprint.tracks[0].trackId).toBe('t-narration');
    expect(blueprint.tracks[0].cues.map((c) => c.cueId)).toEqual(['c1']);
  });

  // Required test E — Audio Blueprint runtime equals canonical Film Blueprint runtime.
  it('always reports the Film Blueprint runtime, never an independently-derived audio duration', () => {
    const tracks: AudioTrackLike[] = [
      track({ cues: [cue({ startTimeSeconds: 0, durationSeconds: 1 })] }),
    ];
    const blueprint = buildAudioBlueprint({ filmBlueprint: { runtimeSeconds: 999 }, tracks });
    expect(blueprint.runtimeSeconds).toBe(999);
  });

  // Required test G — speech, ambience, SFX and music can coexist.
  it('supports narration, dialogue, ambience, sfx, and music simultaneously', () => {
    const tracks: AudioTrackLike[] = [
      track({ id: 't1', type: 'NARRATION', cues: [cue({ id: 'c1', text: 'Once upon a time...' })] }),
      track({ id: 't2', type: 'DIALOGUE', cues: [cue({ id: 'c2', text: 'Wait!', characterMemoryId: 'char-1' })] }),
      track({ id: 't3', type: 'AMBIENCE', cues: [cue({ id: 'c3', durationSeconds: 10 })] }),
      track({ id: 't4', type: 'SFX', cues: [cue({ id: 'c4', durationSeconds: 0.3 })] }),
      track({ id: 't5', type: 'MUSIC', cues: [cue({ id: 'c5', durationSeconds: 12 })] }),
    ];
    const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks });
    expect(blueprint.tracks.map((t) => t.type).sort()).toEqual(['AMBIENCE', 'DIALOGUE', 'MUSIC', 'NARRATION', 'SFX']);
  });

  // Required test I — silent Audio Blueprint remains valid.
  it('produces a valid, empty-but-well-formed blueprint when no cues exist', () => {
    const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks: [] });
    expect(blueprint.hasAudio).toBe(false);
    expect(blueprint.tracks).toEqual([]);
    expect(blueprint.duckingWindows).toEqual([]);
    expect(blueprint.runtimeSeconds).toBe(FILM_BLUEPRINT.runtimeSeconds);
  });

  it('is a deep copy — mutating the input tracks after the call does not change the returned blueprint (snapshot immutability)', () => {
    const tracks: AudioTrackLike[] = [track({ cues: [cue({ id: 'c1', text: 'original' })] })];
    const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks });
    tracks[0].cues[0].text = 'mutated after the fact';
    tracks[0].name = 'renamed after the fact';
    expect(blueprint.tracks[0].cues[0].text).toBe('original');
    expect(blueprint.tracks[0].name).toBe(track().name);
  });

  // --- Ownership tests 1 & 2 of 3 (test 3 — the worker's own independent
  // gate against a tampered snapshot — lives in movieRenderWorkerAudio.test.ts) ---
  describe('audio asset resolution (Persisted cue -> audioAssetId; Resolved Blueprint -> audioAssetId + storageKey)', () => {
    it('1: same-project asset -> resolves, returns storageKey, no rejection recorded', () => {
      const tracks: AudioTrackLike[] = [track({ cues: [cue({ id: 'c1', audioAssetId: 'asset-1' })] })];
      const resolvedAudioAssets = new Map([['asset-1', { storageKey: 'story-projects/p1/audio/asset-1.wav' }]]);
      const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks, resolvedAudioAssets });
      const resolvedCue = blueprint.tracks[0].cues[0];
      expect(resolvedCue.audioAssetId).toBe('asset-1');
      expect(resolvedCue.storageKey).toBe('story-projects/p1/audio/asset-1.wav');
      expect(blueprint.rejectedAudioAssetReferences).toEqual([]);
    });

    it('2: foreign-project asset (not in the caller\'s project-scoped map) -> typed rejection, not a silent downgrade', () => {
      const tracks: AudioTrackLike[] = [track({ cues: [cue({ id: 'c1', audioAssetId: 'foreign-asset' })] })];
      // Caller's map is project-scoped and simply never contains a foreign id.
      const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks, resolvedAudioAssets: new Map() });
      const resolvedCue = blueprint.tracks[0].cues[0];
      expect(resolvedCue.audioAssetId).toBeNull();
      expect(resolvedCue.storageKey).toBeNull();
      expect(blueprint.rejectedAudioAssetReferences).toEqual([{ cueId: 'c1', audioAssetId: 'foreign-asset', code: 'AUDIO_ASSET_PROJECT_MISMATCH' }]);
    });

    it('distinguishes a cue that never had an asset from a cue whose asset was rejected — only the rejected one is recorded', () => {
      const tracks: AudioTrackLike[] = [track({ cues: [
        cue({ id: 'no-asset', audioAssetId: null }),
        cue({ id: 'rejected-asset', audioAssetId: 'foreign-asset' }),
      ] })];
      const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks, resolvedAudioAssets: new Map() });
      expect(blueprint.rejectedAudioAssetReferences.map((r) => r.cueId)).toEqual(['rejected-asset']);
      expect(blueprint.rejectedAudioAssetReferences.some((r) => r.cueId === 'no-asset')).toBe(false);
    });

    it('defaults resolvedAudioAssets to empty when omitted — fail closed, everything with an audioAssetId is rejected', () => {
      const tracks: AudioTrackLike[] = [track({ cues: [cue({ id: 'c1', audioAssetId: 'asset-1' })] })];
      const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks });
      expect(blueprint.tracks[0].cues[0].audioAssetId).toBeNull();
      expect(blueprint.rejectedAudioAssetReferences).toHaveLength(1);
    });
  });
});

describe('computeDuckingWindows', () => {
  // Required test H — ducking plan is deterministic.
  it('derives one window per ducking-enabled speech cue, sorted by start time, independent of input order', () => {
    const tracks: AudioBlueprintTrack[] = [
      {
        trackId: 't1', type: 'DIALOGUE', name: 'Dialogue', volume: 1, order: 0,
        cues: [
          { cueId: 'late', startTimeSeconds: 5, endTimeSeconds: 7, trimStartSeconds: 0, trimEndSeconds: null, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null, sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null, storageKey: null, duckingEnabled: true, duckingAmountDb: 6 },
          { cueId: 'early', startTimeSeconds: 0, endTimeSeconds: 2, trimStartSeconds: 0, trimEndSeconds: null, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null, sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null, storageKey: null, duckingEnabled: true, duckingAmountDb: null },
          { cueId: 'no-duck', startTimeSeconds: 3, endTimeSeconds: 4, trimStartSeconds: 0, trimEndSeconds: null, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null, sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null, storageKey: null, duckingEnabled: false, duckingAmountDb: null },
        ],
      },
    ];
    const first = computeDuckingWindows(tracks);
    const second = computeDuckingWindows(tracks);
    expect(first).toEqual(second); // deterministic — same input, same output
    expect(first.map((w) => w.sourceCueId)).toEqual(['early', 'late']); // sorted by start time
    expect(first.find((w) => w.sourceCueId === 'early')?.amountDb).toBe(8); // DEFAULT_DUCKING_AMOUNT_DB fallback
    expect(first.find((w) => w.sourceCueId === 'late')?.amountDb).toBe(6);
    expect(first.some((w) => w.sourceCueId === 'no-duck')).toBe(false);
  });

  it('never ducks from a non-speech track (AMBIENCE/MUSIC cannot duck themselves or each other)', () => {
    const tracks: AudioBlueprintTrack[] = [
      {
        trackId: 't1', type: 'MUSIC', name: 'Music', volume: 1, order: 0,
        cues: [{ cueId: 'music-1', startTimeSeconds: 0, endTimeSeconds: 10, trimStartSeconds: 0, trimEndSeconds: null, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, text: null, performancePreset: null, performanceDirection: null, sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null, storageKey: null, duckingEnabled: true, duckingAmountDb: 6 }],
      },
    ];
    expect(computeDuckingWindows(tracks)).toEqual([]);
  });
});

describe('nextAudioVersionFromExisting', () => {
  // Required test F — version save/restore/duplicate uses monotonic unique
  // version numbers. This explicitly reproduces the old Sequence bug class
  // (a restore-then-save sequence that produced 1, 2, 2 instead of 1, 2, 3)
  // for the Audio Plan version table:
  //   save v1 -> save v2 -> restore v1 -> save/duplicate again -> must be v3
  it('save v1, save v2, restore v1, save/duplicate again -> v3 (not v1,v2,2 — the old Sequence bug)', () => {
    const versions: Array<{ versionNumber: number }> = [];

    // save v1
    versions.push({ versionNumber: nextAudioVersionFromExisting(versions) });
    expect(versions.at(-1)?.versionNumber).toBe(1);

    // save v2
    versions.push({ versionNumber: nextAudioVersionFromExisting(versions) });
    expect(versions.at(-1)?.versionNumber).toBe(2);

    // restore v1 — a pure read/rollback of plan state; it must NOT create a
    // version row and must NOT rewind what nextAudioVersionFromExisting
    // would compute next. Simulated here as "no push to `versions`".
    const nextAfterRestore = nextAudioVersionFromExisting(versions);
    expect(nextAfterRestore).toBe(3); // still 3, even though the restored content is v1's

    // save/duplicate again immediately after restoring v1
    versions.push({ versionNumber: nextAudioVersionFromExisting(versions) });

    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(versions.at(-1)?.versionNumber).not.toBe(2); // explicitly not the old "1, 2, 2" bug
  });

  it('is unaffected by array order — always max + 1', () => {
    const versions = [{ versionNumber: 3 }, { versionNumber: 1 }, { versionNumber: 5 }, { versionNumber: 2 }];
    expect(nextAudioVersionFromExisting(versions)).toBe(6);
  });

  it('handles missing/null versionNumber entries safely', () => {
    const versions = [{ versionNumber: null }, { versionNumber: undefined }, { versionNumber: 2 }];
    expect(nextAudioVersionFromExisting(versions as any)).toBe(3);
  });
});

describe('toR16SafeAudioSummary', () => {
  // Required test N — R16 receives no creator/audio technical fields.
  it('returns an object with zero keys — Phase 9B.2 ships no R16 audio surface at all', () => {
    const blueprint = buildAudioBlueprint({
      filmBlueprint: FILM_BLUEPRINT,
      tracks: [track({ cues: [cue({ text: 'secret dialogue', voiceProfileId: 'vp-1' })] })],
    });
    const summary = toR16SafeAudioSummary(blueprint);
    expect(Object.keys(summary)).toHaveLength(0);
    expect(JSON.stringify(summary)).not.toContain('secret dialogue');
    expect(JSON.stringify(summary)).not.toContain('vp-1');
  });
});

describe('combineRenderHash', () => {
  it('returns the visual hash completely unchanged for a silent (no-audio) blueprint — zero behavior change for existing renders', () => {
    const silentBlueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks: [] });
    expect(combineRenderHash('visual-hash-abc', silentBlueprint)).toBe('visual-hash-abc');
    expect(combineRenderHash('visual-hash-abc', null)).toBe('visual-hash-abc');
  });

  it('produces a different combined hash when only the audio blueprint changes', () => {
    const tracksA = [track({ cues: [cue({ id: 'c1', text: 'version A' })] })];
    const tracksB = [track({ cues: [cue({ id: 'c1', text: 'version B' })] })];
    const blueprintA = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks: tracksA });
    const blueprintB = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks: tracksB });
    const hashA = combineRenderHash('visual-hash-abc', blueprintA);
    const hashB = combineRenderHash('visual-hash-abc', blueprintB);
    expect(hashA).not.toBe(hashB);
    expect(hashA).not.toBe('visual-hash-abc'); // audio-bearing renders get a distinct combined key
  });
});

describe('hashAudioBlueprint', () => {
  it('is unaffected by rejectedAudioAssetReferences — identical creative content, differing only in what failed to resolve, hashes the same', () => {
    const tracks: AudioTrackLike[] = [track({ cues: [cue({ id: 'c1', audioAssetId: 'foreign-asset' })] })];
    const rejected = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks, resolvedAudioAssets: new Map() });
    const neverHadAnAsset = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks: [track({ cues: [cue({ id: 'c1', audioAssetId: null })] })] });
    // Both end up with the exact same resolved shape (audioAssetId/storageKey
    // both null) — the ONLY difference is rejectedAudioAssetReferences, which
    // must not affect the hash.
    expect(rejected.rejectedAudioAssetReferences).toHaveLength(1);
    expect(neverHadAnAsset.rejectedAudioAssetReferences).toHaveLength(0);
    expect(hashAudioBlueprint(rejected)).toBe(hashAudioBlueprint(neverHadAnAsset));
  });

  it('changes when audioAssetId or storageKey changes — the resolved identity IS part of the hashed content', () => {
    const withAssetA = buildAudioBlueprint({
      filmBlueprint: FILM_BLUEPRINT,
      tracks: [track({ cues: [cue({ id: 'c1', audioAssetId: 'asset-a' })] })],
      resolvedAudioAssets: new Map([['asset-a', { storageKey: 'key-a' }]]),
    });
    const withAssetB = buildAudioBlueprint({
      filmBlueprint: FILM_BLUEPRINT,
      tracks: [track({ cues: [cue({ id: 'c1', audioAssetId: 'asset-b' })] })],
      resolvedAudioAssets: new Map([['asset-b', { storageKey: 'key-b' }]]),
    });
    expect(hashAudioBlueprint(withAssetA)).not.toBe(hashAudioBlueprint(withAssetB));
  });

  it('never has a URL-shaped field to accidentally hash — the resolved cue carries only audioAssetId and storageKey', () => {
    const blueprint = buildAudioBlueprint({
      filmBlueprint: FILM_BLUEPRINT,
      tracks: [track({ cues: [cue({ id: 'c1', audioAssetId: 'asset-a' })] })],
      resolvedAudioAssets: new Map([['asset-a', { storageKey: 'key-a' }]]),
    });
    const keys = Object.keys(blueprint.tracks[0].cues[0]);
    for (const forbidden of ['signedUrl', 'downloadUrl', 'publicUrl', 'temporaryPath', 'resolvedAt', 'url']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('summarizeUnmaterializedSpeechCues', () => {
  it('does not count a rejected (typed-mismatch) cue as ordinary "no audio yet" — those are different conditions', () => {
    const tracks: AudioTrackLike[] = [
      track({ id: 't1', type: 'NARRATION', cues: [
        cue({ id: 'never-had-one', audioAssetId: null }),
        cue({ id: 'rejected', audioAssetId: 'foreign-asset' }),
      ] }),
    ];
    const blueprint = buildAudioBlueprint({ filmBlueprint: FILM_BLUEPRINT, tracks, resolvedAudioAssets: new Map() });
    const summary = summarizeUnmaterializedSpeechCues(blueprint);
    // Only "never-had-one" counts toward the expected, ordinary message —
    // "rejected" is a distinct anomalous condition, visible via
    // rejectedAudioAssetReferences instead, not folded into this count.
    expect(summary.count).toBe(1);
    expect(blueprint.rejectedAudioAssetReferences).toHaveLength(1);
  });
});
