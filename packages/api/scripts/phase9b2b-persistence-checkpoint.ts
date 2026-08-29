/**
 * Phase 9B.2B persistence checkpoint.
 *
 * Exercises the REAL tRPC procedures (via appRouter.createCaller) against the
 * REAL staging Postgres database — not mocks, not a reimplementation of the
 * logic under test. This is "run the actual data path," per the review's
 * explicit instruction not to rely only on pure-function unit tests for the
 * persistence-level invariants.
 *
 * MOVIE_RENDER_WORKER_DISABLED=true is set before any createMovieRender call
 * — this checkpoint is entirely about the DB/idempotency/ownership layer, not
 * FFmpeg rendering (that is what scripts/phase9b2-audio-render-checkpoint.ts
 * already proves independently, with real ffmpeg). Jobs stay QUEUED, which
 * is an ACTIVE_MOVIE_RENDER_STATUSES member, so reuse-matching still behaves
 * exactly as it would for a job that actually completed.
 *
 * Everything this script creates is deleted again in a `finally` block. Nothing
 * here mutates the pre-existing QA project's other tracks/cues/render history.
 *
 * Lives under packages/api/scripts/ (not root scripts/) specifically so
 * Node's module resolution finds packages/api/node_modules/@raivstream/database
 * — a real PrismaClient import, unlike the other checkpoint scripts, which
 * only ever import pure-planning functions with mocked Prisma.
 */
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';

process.env.MOVIE_RENDER_WORKER_DISABLED = 'true';

const QA_EMAIL = 'phase9b2-qa@raivstream.test';

function buildContext(prisma: PrismaClient, user: any): Context {
  return {
    prisma,
    userId: user.id,
    isR16: false,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      premiumTier: user.premiumTier,
      verified: user.verified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      totalViews: user.totalViews,
      totalLikes: user.totalLikes,
    },
  };
}

async function main() {
  const prisma = new PrismaClient();
  const results: Record<string, unknown> = {};
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const qaUser = await prisma.user.findUnique({ where: { email: QA_EMAIL } });
    if (!qaUser) throw new Error(`QA user ${QA_EMAIL} not found on this database — refusing to run against an unexpected DB`);

    const project = await prisma.storyProject.findFirst({ where: { userId: qaUser.id }, orderBy: { createdAt: 'asc' } });
    if (!project) throw new Error('No StoryProject found for the QA user');

    const sequence = await prisma.storySequence.findFirst({ where: { projectId: project.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
    if (!sequence) throw new Error('No StorySequence found for the QA project');

    const ctx = buildContext(prisma, qaUser);
    const caller = appRouter.createCaller(ctx);

    // ── Part 1: render snapshot immutability + idempotency including audio identity ──
    // (guardrails #4, #6, #7 — mandatory test: V+A -> X; V+B -> not X; V+A replay -> may reuse X)
    {
      const audioPlanResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
      const planId = audioPlanResult.plan.id;

      const track = await caller.story.addTrack({ projectId: project.id, planId, type: 'SFX', name: 'Phase9B2B Persistence Test Track' });
      cleanup.push(async () => { await prisma.audioTrack.deleteMany({ where: { id: track.id } }); });

      const cue = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 1, volume: 1, duckingEnabled: false });

      const renderA1 = await caller.story.createMovieRender({ projectId: project.id, sequenceId: sequence.id });
      cleanup.push(async () => { await prisma.movieRenderJob.deleteMany({ where: { id: renderA1.job.id } }); });
      const jobX = renderA1.job.id;
      const hashX = (renderA1.job as any).renderPlanHash;

      // Snapshot immutability check target: capture what X's audio snapshot
      // says right now (state A), before B ever exists.
      const jobXBeforeEdit = await prisma.movieRenderJob.findUnique({ where: { id: jobX } });
      const snapshotVolumeAtCreation = (jobXBeforeEdit?.audioBlueprintSnapshot as any)?.tracks
        ?.flatMap((t: any) => t.cues)?.find((c: any) => c.cueId === cue.id)?.volume;

      // Replay immediately (still state A) -> must reuse X.
      const renderA2 = await caller.story.createMovieRender({ projectId: project.id, sequenceId: sequence.id });

      // Edit -> state B (materially changes the Audio Blueprint hash).
      await caller.story.updateCue({ projectId: project.id, cueId: cue.id, volume: 0.5 });
      const renderB1 = await caller.story.createMovieRender({ projectId: project.id, sequenceId: sequence.id });
      cleanup.push(async () => { await prisma.movieRenderJob.deleteMany({ where: { id: renderB1.job.id } }); });
      const jobY = renderB1.job.id;
      const hashY = (renderB1.job as any).renderPlanHash;

      // Snapshot immutability re-check: X's persisted snapshot must NOT have
      // moved to B's volume just because the live plan changed after X was created.
      const jobXAfterLiveEditToB = await prisma.movieRenderJob.findUnique({ where: { id: jobX } });
      const snapshotVolumeAfterLiveEdit = (jobXAfterLiveEditToB?.audioBlueprintSnapshot as any)?.tracks
        ?.flatMap((t: any) => t.cues)?.find((c: any) => c.cueId === cue.id)?.volume;

      // Replay B -> must reuse Y, not create a third job.
      const renderB2 = await caller.story.createMovieRender({ projectId: project.id, sequenceId: sequence.id });

      // Revert live plan back to byte-identical A content (in place — same
      // cueId, not a restoreAudioVersion delete+recreate, so the blueprint
      // hash is purely content-addressed) -> must reuse X again, proving
      // idempotency is content-based, not time/order-based.
      await caller.story.updateCue({ projectId: project.id, cueId: cue.id, volume: 1 });
      const renderA3 = await caller.story.createMovieRender({ projectId: project.id, sequenceId: sequence.id });

      results.part1_idempotency_and_snapshot = {
        jobX,
        jobY,
        hashX_equals_hashY: hashX === hashY,
        replayA_before_edit: { reused: renderA2.reused, jobId: renderA2.job.id, matchesX: renderA2.job.id === jobX },
        editToB: { reused: renderB1.reused, jobId: renderB1.job.id, isNewJob: renderB1.job.id !== jobX },
        replayB: { reused: renderB2.reused, jobId: renderB2.job.id, matchesY: renderB2.job.id === jobY },
        revertToA_replay: { reused: renderA3.reused, jobId: renderA3.job.id, matchesX_again: renderA3.job.id === jobX },
        snapshotImmutability: {
          volumeAtCreation: snapshotVolumeAtCreation,
          volumeAfterLiveEditToB: snapshotVolumeAfterLiveEdit,
          unchanged: snapshotVolumeAtCreation === snapshotVolumeAfterLiveEdit,
        },
        audioBlueprintHashStored: Boolean((jobXBeforeEdit as any)?.audioBlueprintHash),
      };
    }

    // ── Part 2: Audio Plan version numbering, persistence-level (guardrail #8) ──
    // Fully isolated throwaway sequence/plan so restoreAudioVersion's
    // delete-and-recreate-all-tracks behavior can never touch the shared QA
    // plan used in Part 1.
    {
      const throwawaySequence = await prisma.storySequence.create({
        data: { projectId: project.id, title: 'Phase9B2B Persistence Test Sequence (disposable)' },
      });
      cleanup.push(async () => { await prisma.storySequence.deleteMany({ where: { id: throwawaySequence.id } }); }); // cascades plan/tracks/cues/versions

      const planResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: throwawaySequence.id });
      const planId = planResult.plan.id;
      const track = await caller.story.addTrack({ projectId: project.id, planId, type: 'MUSIC', name: 'Versioning Test Track' });
      await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 0, volume: 1 });

      const v1 = await caller.story.saveAudioVersion({ projectId: project.id, planId, title: 'v1' });
      const v2 = await caller.story.saveAudioVersion({ projectId: project.id, planId, title: 'v2' });
      await caller.story.restoreAudioVersion({ projectId: project.id, planId, versionNumber: v1.versionNumber });
      const v3 = await caller.story.saveAudioVersion({ projectId: project.id, planId, title: 'v3 (save after restoring v1)' });

      const storedVersions = await prisma.audioPlanVersion.findMany({ where: { planId }, orderBy: { versionNumber: 'asc' }, select: { versionNumber: true, title: true } });

      results.part2_version_numbering = {
        sequence: [v1.versionNumber, v2.versionNumber, v3.versionNumber],
        storedInDb: storedVersions,
        isExactly_1_2_3: v1.versionNumber === 1 && v2.versionNumber === 2 && v3.versionNumber === 3,
        noDuplicateAfterRestore: v3.versionNumber !== v2.versionNumber, // the exact old bug: 1,2,2
      };
    }

    // ── Part 3: cross-project AudioAsset ownership rejected (guardrail #14) ──
    {
      const otherProject = await prisma.storyProject.create({
        data: { userId: qaUser.id, title: 'Phase9B2B Cross-Project Test (disposable)' },
      });
      cleanup.push(async () => { await prisma.storyProject.deleteMany({ where: { id: otherProject.id } }); }); // cascades its audio assets

      const foreignAsset = await prisma.audioAsset.create({
        data: {
          projectId: otherProject.id,
          userId: qaUser.id,
          storageKey: 'story-projects/other-project/audio/foreign-asset.wav',
          publicUrl: 'https://cdn.test/foreign-asset.wav',
          mimeType: 'audio/wav',
          sourceKind: 'SYNTHETIC_TEST',
        },
      });
      const ownAsset = await prisma.audioAsset.create({
        data: {
          projectId: project.id,
          userId: qaUser.id,
          storageKey: 'story-projects/own-project/audio/own-asset.wav',
          publicUrl: 'https://cdn.test/own-asset.wav',
          mimeType: 'audio/wav',
          sourceKind: 'SYNTHETIC_TEST',
        },
      });
      cleanup.push(async () => { await prisma.audioAsset.deleteMany({ where: { id: ownAsset.id } }); });

      const sameProjectAudioPlan = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
      const sameProjectTrack = await caller.story.addTrack({ projectId: project.id, planId: sameProjectAudioPlan.plan.id, type: 'SFX', name: 'Ownership Test Track' });
      cleanup.push(async () => { await prisma.audioTrack.deleteMany({ where: { id: sameProjectTrack.id } }); });

      // Test 1 of 3: Project A cue + Project A audio asset -> allowed.
      let allowed = false;
      let allowedCueId: string | null = null;
      try {
        const cue = await caller.story.addCue({ projectId: project.id, trackId: sameProjectTrack.id, startTimeSeconds: 0, volume: 1, audioAssetId: ownAsset.id });
        allowed = cue.audioAssetId === ownAsset.id;
        allowedCueId = cue.id;
      } catch { /* leave allowed=false */ }

      // End-to-end proof that the new resolvedAudioAssets wiring actually
      // resolves storageKey through the real query path, not just that the
      // write succeeded.
      const blueprintAfterAllowed = await caller.story.getAudioBlueprint({ projectId: project.id, sequenceId: sequence.id });
      const resolvedCue = blueprintAfterAllowed.blueprint.tracks
        .flatMap((t: any) => t.cues).find((c: any) => c.cueId === allowedCueId);

      // Test 2 of 3: Project A cue + Project B audio asset -> denied.
      let denied = false;
      let deniedCode: string | null = null;
      try {
        await caller.story.addCue({ projectId: project.id, trackId: sameProjectTrack.id, startTimeSeconds: 0, volume: 1, audioAssetId: foreignAsset.id });
      } catch (error: any) {
        denied = true;
        deniedCode = error?.code ?? error?.data?.code ?? null;
      }
      // Confirm the denied write genuinely never persisted anything referencing the foreign asset.
      const leakedCues = await prisma.audioCue.count({ where: { trackId: sameProjectTrack.id, audioAssetId: foreignAsset.id } });

      results.part3_cross_project_asset_ownership = {
        allowed: { succeeded: allowed, blueprintResolvedAudioAssetId: resolvedCue?.audioAssetId ?? null, blueprintResolvedStorageKey: resolvedCue?.storageKey ?? null },
        denied: { denied, deniedCode, leakedCuesInDb: leakedCues },
      };
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch (cleanupError) { console.error('[cleanup] failed:', cleanupError); }
    }
    await prisma.$disconnect();
  }
}

main();
