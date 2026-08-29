import { describe, expect, it } from 'vitest';
import { restoreAudioVersionForPlan, toAudioCueRestoreCreateInput, toAudioTrackRestoreCreateInput } from '../story';
import { nextAudioVersionFromExisting } from '../../lib/audioPlanning';

/**
 * Phase 9B.2B.1 hotfix regression suite.
 *
 * Production qualification found `restoreAudioVersion` threw
 * `Unknown argument \`audioAsset\`` for any plan with at least one track.
 * Root cause: `audioPlanInclude` (added in 6bfb6a4, for the Audio tab's
 * <audio> preview player) nests each cue's `audioAsset` relation, so
 * `saveAudioVersion`'s JSON snapshot carries that relation object too —
 * and the old restore code spread the snapshot straight into
 * `tx.audioCue.create({ data: {...cueRest} })`, which Prisma rejects since
 * `audioAsset` isn't a scalar/FK write field.
 *
 * `mockPrisma` below is deliberately STRICT — its create() calls validate
 * argument keys against the real Prisma-allowed field set and throw an
 * "Unknown argument" error for anything else, exactly reproducing what the
 * real Prisma client does. This is what makes test D below a genuine
 * reproduction of the production failure (it fails against the pre-fix
 * spread-based reconstruction and passes against the whitelist mappers),
 * not just an isolated check of the mapper functions in a vacuum.
 */

const ALLOWED_TRACK_CREATE_FIELDS = new Set(['planId', 'type', 'name', 'enabled', 'volume', 'order', 'cues']);
const ALLOWED_CUE_CREATE_FIELDS = new Set([
  'sequenceSceneId', 'characterMemoryId', 'voiceProfileId', 'audioAssetId', 'enabled', 'order',
  'startTimeSeconds', 'durationSeconds', 'trimStartSeconds', 'trimEndSeconds', 'volume',
  'fadeInSeconds', 'fadeOutSeconds', 'text', 'performancePreset', 'performanceDirection',
  'duckingEnabled', 'duckingAmountDb', 'metadata',
]);

function assertKnownFields(obj: Record<string, unknown>, allowed: Set<string>, modelLabel: string) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown argument \`${key}\`. Did you mean one of ${[...allowed].join(', ')}? (${modelLabel})`);
    }
  }
}

type MockCue = Record<string, any>;
type MockTrack = { id: string; planId: string; cues: MockCue[] } & Record<string, any>;
type MockJob = { id: string; audioBlueprintSnapshot: any };

function makeMockCtx(state: {
  plan: { id: string; projectId: string; sequenceId: string };
  tracks: MockTrack[];
  versions: Array<{ planId: string; versionNumber: number; snapshot: any[] }>;
  audioAssets: Array<{ id: string; projectId: string; storageKey: string }>;
  movieRenderJobs?: MockJob[];
}) {
  let cueCounter = 0;
  let trackCounter = 0;
  const movieRenderJobCalls: string[] = [];

  const prisma = {
    storyProject: {
      findFirst: async ({ where }: any) => (where.id === state.plan.projectId ? { id: state.plan.projectId } : null),
    },
    audioPerformancePlan: {
      findFirst: async ({ where }: any) =>
        where.id === state.plan.id && where.projectId === state.plan.projectId ? { ...state.plan } : null,
    },
    audioPlanVersion: {
      findUnique: async ({ where }: any) => {
        const v = state.versions.find(
          (x) => x.planId === where.planId_versionNumber.planId && x.versionNumber === where.planId_versionNumber.versionNumber,
        );
        return v ? { ...v } : null;
      },
    },
    audioAsset: {
      findFirst: async ({ where }: any) => state.audioAssets.find((a) => a.id === where.id && a.projectId === where.projectId) ?? null,
    },
    movieRenderJob: {
      findMany: async () => { movieRenderJobCalls.push('findMany'); return state.movieRenderJobs ?? []; },
      update: async () => { movieRenderJobCalls.push('update'); throw new Error('restore must never touch MovieRenderJob'); },
    },
    $transaction: async (fn: any) => {
      const tx = {
        audioTrack: {
          deleteMany: async ({ where }: any) => {
            state.tracks = state.tracks.filter((t) => t.planId !== where.planId);
          },
          create: async ({ data }: any) => {
            const { cues: cuesInput, ...trackFields } = data;
            assertKnownFields(trackFields, new Set([...ALLOWED_TRACK_CREATE_FIELDS].filter((f) => f !== 'cues')), 'AudioTrack');
            const cueCreates = cuesInput?.create ?? [];
            const cues: MockCue[] = cueCreates.map((cueData: any) => {
              assertKnownFields(cueData, ALLOWED_CUE_CREATE_FIELDS, 'AudioCue');
              cueCounter += 1;
              return { id: `restored-cue-${cueCounter}`, trackId: undefined, ...cueData };
            });
            trackCounter += 1;
            const track: MockTrack = { id: `restored-track-${trackCounter}`, planId: state.plan.id, ...trackFields, cues };
            cues.forEach((c) => { c.trackId = track.id; });
            state.tracks.push(track);
            return track;
          },
        },
      };
      return fn(tx);
    },
  };
  return { ctx: { prisma, user: { id: 'user-1' }, isR16: false }, state, movieRenderJobCalls };
}

const BASE_INPUT = { projectId: 'project-a', planId: 'plan-1', versionNumber: 1 };

function baseState(overrides: Partial<Parameters<typeof makeMockCtx>[0]> = {}) {
  return {
    plan: { id: 'plan-1', projectId: 'project-a', sequenceId: 'seq-1' },
    tracks: [],
    versions: [],
    audioAssets: [],
    ...overrides,
  };
}

// A snapshot cue shaped exactly like a real relation-expanded read result —
// this is the reproduction fixture: `audioAsset` (and, for test E,
// `voiceProfile`/`characterMemory`) are objects a real Prisma `include`
// would attach, never valid Prisma create() arguments.
function relationExpandedCue(overrides: Record<string, any> = {}) {
  return {
    id: 'snap-cue-1', trackId: 'snap-track-1', createdAt: new Date(), updatedAt: new Date(),
    sequenceSceneId: null, characterMemoryId: null, voiceProfileId: null, audioAssetId: null,
    enabled: true, order: 0, startTimeSeconds: 0, durationSeconds: 2, trimStartSeconds: null, trimEndSeconds: null,
    volume: 1, fadeInSeconds: null, fadeOutSeconds: null, text: null, performancePreset: null, performanceDirection: null,
    duckingEnabled: false, duckingAmountDb: null, metadata: null,
    audioAsset: null, // ← the relation object that broke restore
    ...overrides,
  };
}

function relationExpandedTrack(overrides: Record<string, any> = {}, cues: any[] = [relationExpandedCue()]) {
  return {
    id: 'snap-track-1', planId: 'plan-1', createdAt: new Date(), updatedAt: new Date(),
    type: 'MUSIC', name: 'Snapshot Track', enabled: true, volume: 1, order: 0,
    cues,
    ...overrides,
  };
}

describe('restoreAudioVersionForPlan (Phase 9B.2B.1 hotfix)', () => {
  // A. plan with track but no cue -> restore succeeds
  it('A: restores a track with zero cues without error', async () => {
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [])] }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).resolves.toMatchObject({ id: 'plan-1' });
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].cues).toHaveLength(0);
  });

  // B. unmaterialized NARRATION/DIALOGUE cue (no audioAssetId) -> restore succeeds
  it('B: restores an unmaterialized speech cue (no audioAssetId) without error', async () => {
    const cue = relationExpandedCue({ text: 'Hello there', performanceDirection: 'Warm', audioAssetId: null });
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({ type: 'DIALOGUE' }, [cue])] }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).resolves.toBeTruthy();
    expect(state.tracks[0].cues[0].text).toBe('Hello there');
    expect(state.tracks[0].cues[0].audioAssetId).toBeNull();
  });

  // C. cue with same-project audioAsset -> restore succeeds, audioAssetId preserved
  it('C: restores a materialized cue and preserves its audioAssetId', async () => {
    const cue = relationExpandedCue({
      audioAssetId: 'asset-1',
      audioAsset: { id: 'asset-1', publicUrl: 'https://cdn.example/a.wav', durationSeconds: 4, mimeType: 'audio/wav', sourceKind: 'UPLOADED' },
    });
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [cue])] }],
      audioAssets: [{ id: 'asset-1', projectId: 'project-a', storageKey: 'story-projects/project-a/audio/a.wav' }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).resolves.toBeTruthy();
    expect(state.tracks[0].cues[0].audioAssetId).toBe('asset-1');
  });

  // D. THE REPRODUCTION: relation-expanded read result contains `audioAsset`
  //    -> restore write must never pass it to Prisma. Against the pre-fix
  //    spread-based code, this test throws "Unknown argument `audioAsset`"
  //    (the exact production failure); against the fix, it passes.
  it('D: never passes the relation-expanded `audioAsset` object into a Prisma create() call', async () => {
    const cue = relationExpandedCue({
      audioAssetId: 'asset-1',
      audioAsset: { id: 'asset-1', publicUrl: 'https://cdn.example/a.wav', durationSeconds: 4, mimeType: 'audio/wav', sourceKind: 'UPLOADED' },
    });
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [cue])] }],
      audioAssets: [{ id: 'asset-1', projectId: 'project-a', storageKey: 'k' }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).resolves.toBeTruthy();
    // The mock's strict create() would have thrown "Unknown argument
    // `audioAsset`" already if it had leaked — reaching here at all is part
    // of the proof. Also assert directly that no restored cue carries it.
    expect(state.tracks[0].cues[0]).not.toHaveProperty('audioAsset');
    expect(Object.keys(state.tracks[0].cues[0])).not.toContain('audioAsset');
  });

  // E. Voice Profile / character relation objects, if a read query ever
  //    includes them, must not leak into Prisma create data either — the
  //    whitelist mapper protects against the whole class, not just today's
  //    one offending field.
  it('E: voiceProfile/characterMemory relation objects on the snapshot do not leak into the write', async () => {
    const cue = relationExpandedCue({
      voiceProfileId: 'voice-1',
      voiceProfile: { id: 'voice-1', name: 'Narrator' }, // hypothetical future include
      characterMemoryId: 'char-1',
      characterMemory: { id: 'char-1', name: 'Hero' }, // hypothetical future include
    });
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [cue])] }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).resolves.toBeTruthy();
    expect(state.tracks[0].cues[0].voiceProfileId).toBe('voice-1');
    expect(state.tracks[0].cues[0].characterMemoryId).toBe('char-1');
    expect(state.tracks[0].cues[0]).not.toHaveProperty('voiceProfile');
    expect(state.tracks[0].cues[0]).not.toHaveProperty('characterMemory');
  });

  // F. save v1 -> mutate live plan -> restore v1 -> creative fields equal the saved state.
  it('F: restore reproduces the exact saved creative values, not the mutated live ones', async () => {
    const savedCue = relationExpandedCue({ startTimeSeconds: 2, volume: 0.6, fadeInSeconds: 0.5 });
    const { ctx, state } = makeMockCtx(baseState({
      // "live" state before restore represents a plan that was mutated after v1 was saved.
      tracks: [{ id: 'live-track', planId: 'plan-1', type: 'MUSIC', name: 'x', enabled: true, volume: 1, order: 0, cues: [{ id: 'live-cue', trackId: 'live-track', startTimeSeconds: 9, volume: 0.1, fadeInSeconds: null }] }],
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [savedCue])] }],
    }));
    await restoreAudioVersionForPlan(ctx, BASE_INPUT);
    expect(state.tracks).toHaveLength(1);
    const restoredCue = state.tracks[0].cues[0];
    expect(restoredCue.startTimeSeconds).toBe(2);
    expect(restoredCue.volume).toBe(0.6);
    expect(restoredCue.fadeInSeconds).toBe(0.5);
  });

  // G. Restore never touches AudioPlanVersion rows, so the pre-existing,
  //    already-qualified monotonic max(existing)+1 versioning invariant
  //    (save v1, save v2, restore v1, save -> v3, never 1,2,2) is
  //    unaffected by this hotfix — verified by exercising the same
  //    exported, already-tested pure function saveAudioVersion relies on.
  it('G: restore does not perturb monotonic version numbering (save v1, save v2, restore v1, save -> v3)', async () => {
    let existingVersions = [{ versionNumber: 1 }];
    expect(nextAudioVersionFromExisting(existingVersions)).toBe(2); // save v2
    existingVersions = [{ versionNumber: 1 }, { versionNumber: 2 }];

    const { ctx } = makeMockCtx(baseState({
      versions: [
        { planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack()] },
        { planId: 'plan-1', versionNumber: 2, snapshot: [relationExpandedTrack()] },
      ],
    }));
    await restoreAudioVersionForPlan(ctx, { ...BASE_INPUT, versionNumber: 1 }); // restore v1

    // existingVersions is untouched by restore (it only ever deletes/creates
    // AudioTrack/AudioCue rows) — the next save still allocates 3, not a
    // reused 2 or a regressed 1.
    expect(nextAudioVersionFromExisting(existingVersions)).toBe(3);
  });

  // H. reload restored plan from DB -> restored state persists correctly.
  it('H: the restored tracks/cues are readable back from the (mock) DB afterward', async () => {
    const cue = relationExpandedCue({ text: 'Persisted line', audioAssetId: 'asset-1' });
    const { ctx, state } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({ name: 'Persisted Track' }, [cue])] }],
      audioAssets: [{ id: 'asset-1', projectId: 'project-a', storageKey: 'k' }],
    }));
    await restoreAudioVersionForPlan(ctx, BASE_INPUT);
    // Simulate "reload" — read the same mutable state a fresh query would see.
    expect(state.tracks[0].name).toBe('Persisted Track');
    expect(state.tracks[0].cues[0].text).toBe('Persisted line');
    expect(state.tracks[0].cues[0].audioAssetId).toBe('asset-1');
  });

  // I. foreign-project asset cannot be introduced through restore.
  it('I: rejects (and applies nothing) when a snapshotted cue references another project\'s audio asset', async () => {
    const cue = relationExpandedCue({ audioAssetId: 'foreign-asset' });
    const { ctx, state } = makeMockCtx(baseState({
      tracks: [{ id: 'existing-track', planId: 'plan-1', type: 'MUSIC', name: 'untouched', enabled: true, volume: 1, order: 0, cues: [] }],
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack({}, [cue])] }],
      // The referenced asset exists, but belongs to a different project.
      audioAssets: [{ id: 'foreign-asset', projectId: 'project-b', storageKey: 'k' }],
    }));
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Rejected before any deletion/recreation — the pre-existing track is untouched.
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].id).toBe('existing-track');
  });

  // J. existing immutable MovieRenderJob snapshots are unaffected by restoring a live Audio Plan.
  it('J: never reads or writes MovieRenderJob — an existing render snapshot is structurally untouched', async () => {
    const preExistingJob = { id: 'job-1', audioBlueprintSnapshot: { hasAudio: true, tracks: [{ cues: [{ cueId: 'x', volume: 0.9 }] }] } };
    const { ctx, movieRenderJobCalls } = makeMockCtx(baseState({
      versions: [{ planId: 'plan-1', versionNumber: 1, snapshot: [relationExpandedTrack()] }],
      movieRenderJobs: [preExistingJob],
    }));
    await restoreAudioVersionForPlan(ctx, BASE_INPUT);
    expect(movieRenderJobCalls).toHaveLength(0); // restore never touches movieRenderJob at all
    expect(preExistingJob.audioBlueprintSnapshot.tracks[0].cues[0].volume).toBe(0.9); // untouched
  });

  it('throws NOT_FOUND for a version number that does not exist', async () => {
    const { ctx } = makeMockCtx(baseState());
    await expect(restoreAudioVersionForPlan(ctx, BASE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('toAudioTrackRestoreCreateInput / toAudioCueRestoreCreateInput (explicit whitelist mappers)', () => {
  it('track mapper emits only real Prisma AudioTrack scalar/FK fields, never id/createdAt/updatedAt/plan/cues', () => {
    const out = toAudioTrackRestoreCreateInput(relationExpandedTrack(), 'plan-1');
    expect(Object.keys(out).sort()).toEqual(['enabled', 'name', 'order', 'planId', 'type', 'volume'].sort());
  });

  it('cue mapper emits only real Prisma AudioCue scalar/FK fields, never id/trackId/createdAt/updatedAt/audioAsset/track', () => {
    const out = toAudioCueRestoreCreateInput(relationExpandedCue({ audioAssetId: 'asset-1', audioAsset: { id: 'asset-1' } }));
    const keys = Object.keys(out).sort();
    expect(keys).not.toContain('audioAsset');
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('trackId');
    expect(keys).not.toContain('createdAt');
    expect(keys).not.toContain('updatedAt');
    expect(out.audioAssetId).toBe('asset-1');
  });
});
