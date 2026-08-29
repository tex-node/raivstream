/**
 * Phase 9B.2B.1 hotfix — staging restore acceptance (release-blocking).
 *
 * Exercises the exact workflow that failed in production, through the real
 * appRouter (not a mock): create plan -> track -> cue (with a materialized
 * same-project AudioAsset) -> save v1 -> mutate live -> restore v1 -> prove
 * restored values, audioAssetId preservation, and monotonic versioning.
 * Also separately tests the simplest production failure shape: a plan with
 * a track and NO cue at all, save -> restore.
 *
 * Fully isolated on a throwaway StorySequence (cloned scene, same pattern
 * used throughout this phase) — never touches shared QA state.
 *
 * Usage: pnpm exec tsx scripts/phase9b2b1-restore-acceptance.ts
 */
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';

const QA_EMAIL = 'phase9b2-qa@raivstream.test';

function buildContext(prisma: PrismaClient, user: any): Context {
  return {
    prisma, userId: user.id, isR16: false,
    user: {
      id: user.id, email: user.email, username: user.username, displayName: user.displayName,
      avatarUrl: user.avatarUrl, role: user.role, premiumTier: user.premiumTier, verified: user.verified,
      followerCount: user.followerCount, followingCount: user.followingCount,
      totalViews: user.totalViews, totalLikes: user.totalLikes,
    },
  };
}

async function main() {
  const prisma = new PrismaClient();
  const results: Record<string, unknown> = {};
  const cleanup: string[] = []; // throwaway sequence ids to delete at the end (cascades everything)

  try {
    const qaUser = await prisma.user.findUniqueOrThrow({ where: { email: QA_EMAIL } });
    const project = await prisma.storyProject.findFirstOrThrow({ where: { userId: qaUser.id }, orderBy: { createdAt: 'asc' } });
    const sourceSequence = await prisma.storySequence.findFirstOrThrow({ where: { projectId: project.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
    const sourceScene = await prisma.storySequenceScene.findFirstOrThrow({ where: { sequenceId: sourceSequence.id, enabled: true }, orderBy: { orderIndex: 'asc' } });
    const ctx = buildContext(prisma, qaUser);
    const caller = appRouter.createCaller(ctx);

    async function newThrowawaySequence(title: string) {
      const seq = await prisma.storySequence.create({ data: { projectId: project.id, title, status: 'DRAFT' } });
      await prisma.storySequenceScene.create({
        data: {
          sequenceId: seq.id, storySceneId: sourceScene.storySceneId, orderIndex: 1, enabled: true,
          durationSeconds: sourceScene.durationSeconds, selectedAssetId: sourceScene.selectedAssetId,
          shotType: sourceScene.shotType, cameraMovement: sourceScene.cameraMovement, cameraSpeed: sourceScene.cameraSpeed,
          transition: 'NONE', transitionDurationSeconds: 0, holdDurationSeconds: 0,
        },
      });
      cleanup.push(seq.id);
      return seq;
    }

    // ── Main scenario: full workflow with a materialized same-project AudioAsset ──
    const seq1 = await newThrowawaySequence('Phase9B2B1 Restore Acceptance — main (disposable)');
    const planResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: seq1.id });
    const track = await caller.story.addTrack({ projectId: project.id, planId: planResult.plan.id, type: 'MUSIC', name: 'Restore Acceptance Track' });

    const asset = await prisma.audioAsset.create({
      data: {
        projectId: project.id, userId: qaUser.id,
        storageKey: `story-projects/${project.id}/audio/restore-acceptance-${Date.now()}.wav`,
        publicUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'audio/wav', sourceKind: 'SYNTHETIC_TEST',
      },
    });
    const cue = await caller.story.addCue({
      projectId: project.id, trackId: track.id, startTimeSeconds: 0, durationSeconds: 3,
      audioAssetId: asset.id, volume: 0.8, fadeInSeconds: 0.2, text: 'Restore acceptance cue',
    });

    const v1 = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult.plan.id, title: 'Acceptance v1' });
    results.step6_save_v1 = { versionNumber: v1.versionNumber };

    // Mutate live plan materially.
    await caller.story.updateCue({ projectId: project.id, cueId: cue.id, volume: 0.15, startTimeSeconds: 5 });

    // Restore v1 through the REAL mutation (this is exactly what threw
    // "Unknown argument `audioAsset`" in production).
    let restoreError: string | null = null;
    try {
      await caller.story.restoreAudioVersion({ projectId: project.id, planId: planResult.plan.id, versionNumber: v1.versionNumber });
    } catch (e: any) {
      restoreError = String(e?.message ?? e);
    }
    results.step8_restore_v1 = { threw: restoreError !== null, errorMessage: restoreError };

    const planAfterRestore = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: seq1.id });
    // Restore deletes and recreates every cue, so the restored cue has a
    // brand-new id — there's exactly one track/one cue in this scenario, so
    // just take it directly rather than trying to match the old id.
    const restoredCue = (planAfterRestore.plan as any).tracks.flatMap((t: any) => t.cues)[0];
    results.step9_11_restored_values = {
      startTimeSeconds: restoredCue?.startTimeSeconds,
      volume: restoredCue?.volume,
      matchesSavedNotMutated: restoredCue?.startTimeSeconds === 0 && restoredCue?.volume === 0.8,
      audioAssetIdPreserved: restoredCue?.audioAssetId === asset.id,
    };
    results.step12_no_unknown_argument_error = { proven: restoreError === null };

    // Save another version -> monotonic numbering.
    const v2 = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult.plan.id, title: 'Acceptance v2 (after restore)' });
    results.step13_monotonic_versioning = { versionNumber: v2.versionNumber, isV2: v2.versionNumber === 2 };

    // ── Simplest production failure shape: track with NO cue at all, save -> restore ──
    const seq2 = await newThrowawaySequence('Phase9B2B1 Restore Acceptance — track-no-cue (disposable)');
    const planResult2 = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: seq2.id });
    await caller.story.addTrack({ projectId: project.id, planId: planResult2.plan.id, type: 'AMBIENCE', name: 'Empty Track' });
    const v1b = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult2.plan.id, title: 'Empty-track v1' });
    let simpleRestoreError: string | null = null;
    try {
      await caller.story.restoreAudioVersion({ projectId: project.id, planId: planResult2.plan.id, versionNumber: v1b.versionNumber });
    } catch (e: any) {
      simpleRestoreError = String(e?.message ?? e);
    }
    results.simplest_failure_shape_track_no_cue = { threw: simpleRestoreError !== null, errorMessage: simpleRestoreError };

    console.log('CLEANUP_SEQUENCE_IDS=' + cleanup.filter(Boolean).join(','));
    console.log('CLEANUP_ASSET_ID=' + asset.id);
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
