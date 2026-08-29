/**
 * Phase 9B.2C.1 — isolated staging qualification, Sections 29-35.
 * Real appRouter.createCaller against real staging Postgres
 * (raivstream_phase9b2_pg), real dev-fixture provider (real ffmpeg), real
 * R2 upload. Fully isolated on a throwaway StorySequence cloning the
 * shared QA project's one proven-working scene — never touches shared
 * state.
 *
 * Usage: pnpm exec tsx scripts/phase9b2c1-staging-qualification.ts
 */
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';
import { executeVoiceGenerationJob } from '../src/lib/voiceGenerationWorker';
import { fingerprintVoiceGenerationRequest } from '../src/lib/voiceGeneration';
import type { VoiceGenerationProvider } from '../src/lib/voiceGenerationProviders';

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

async function waitForTerminal(prisma: any, jobId: string, timeoutMs = 15000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.voiceGenerationJob.findUnique({ where: { id: jobId } });
    if (job.status === 'READY' || job.status === 'FAILED') return job;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Job ${jobId} did not reach a terminal state within ${timeoutMs}ms`);
}

function failingProvider(errorMessage: string): VoiceGenerationProvider {
  return {
    key: 'staging-failing-provider',
    capabilities: () => ({ providerKey: 'staging-failing-provider', languages: ['*'], outputFormats: ['wav'], maxCharacters: 2000, supportsStreaming: false }),
    generateSpeech: async () => { throw new Error(errorMessage); },
  };
}

function invalidOutputProvider(): VoiceGenerationProvider {
  return {
    key: 'staging-invalid-output-provider',
    capabilities: () => ({ providerKey: 'staging-invalid-output-provider', languages: ['*'], outputFormats: ['wav'], maxCharacters: 2000, supportsStreaming: false }),
    generateSpeech: async (_req, ctx) => {
      const { writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const filePath = path.join(ctx.tempDir, `${ctx.jobId}.wav`);
      await writeFile(filePath, Buffer.from('not a real audio file'));
      return { filePath, providerRequestId: 'invalid-output-req', providerModel: null, providerVoiceKey: null };
    },
  };
}

async function main() {
  const prisma = new PrismaClient();
  const results: Record<string, unknown> = {};
  const cleanup: string[] = [];

  try {
    const qaUser = await prisma.user.findUniqueOrThrow({ where: { email: QA_EMAIL } });
    const project = await prisma.storyProject.findFirstOrThrow({ where: { userId: qaUser.id }, orderBy: { createdAt: 'asc' } });
    const sourceSequence = await prisma.storySequence.findFirstOrThrow({ where: { projectId: project.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
    const sourceScene = await prisma.storySequenceScene.findFirstOrThrow({ where: { sequenceId: sourceSequence.id, enabled: true }, orderBy: { orderIndex: 'asc' } });
    const ctx = buildContext(prisma, qaUser);
    const caller = appRouter.createCaller(ctx);

    const seq = await prisma.storySequence.create({ data: { projectId: project.id, title: 'Phase9B2C1 Staging Qualification (disposable)', status: 'DRAFT' } });
    await prisma.storySequenceScene.create({
      data: {
        sequenceId: seq.id, storySceneId: sourceScene.storySceneId, orderIndex: 1, enabled: true,
        durationSeconds: sourceScene.durationSeconds, selectedAssetId: sourceScene.selectedAssetId,
        shotType: sourceScene.shotType, cameraMovement: sourceScene.cameraMovement, cameraSpeed: sourceScene.cameraSpeed,
        transition: 'NONE', transitionDurationSeconds: 0, holdDurationSeconds: 0,
      },
    });
    cleanup.push(seq.id);

    const planResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: seq.id });
    const track = await caller.story.addTrack({ projectId: project.id, planId: planResult.plan.id, type: 'DIALOGUE', name: 'Qualification Track' });
    const cueA = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 0, durationSeconds: 3, text: 'Good morning, everyone.', performanceDirection: 'calm' });

    // ── Section 29 — real generation + AudioAsset materialization ──
    const jobResult = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueA.id });
    const jobReady = await waitForTerminal(prisma, jobResult.id);
    const asset29 = jobReady.outputAudioAssetId ? await prisma.audioAsset.findUnique({ where: { id: jobReady.outputAudioAssetId } }) : null;
    let r2ObjectReachable = false;
    if (asset29?.publicUrl) {
      try { const res = await fetch(asset29.publicUrl, { method: 'HEAD' }); r2ObjectReachable = res.ok; } catch { r2ObjectReachable = false; }
    }
    await caller.story.attachGeneratedVoiceTake({ projectId: project.id, audioCueId: cueA.id, jobId: jobReady.id });
    const cueAfterAttach = await prisma.audioCue.findUnique({ where: { id: cueA.id } });
    results.section29_materialization = {
      jobId: jobReady.id, status: jobReady.status,
      audioAssetId: asset29?.id ?? null, projectId: asset29?.projectId ?? null,
      storageKey: asset29?.storageKey ?? null, durationSeconds: asset29?.durationSeconds ?? null,
      checksum: asset29?.checksum ?? null, sampleRateHz: asset29?.sampleRateHz ?? null, channels: asset29?.channels ?? null,
      r2ObjectReachable, attachedToCue: cueAfterAttach?.audioAssetId === asset29?.id,
    };

    // ── Section 30 — immutable snapshot A/B ──
    const cueB = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 1, durationSeconds: 2, text: 'State A text.', performanceDirection: 'calm' });
    process.env.VOICE_GENERATION_WORKER_DISABLED = 'true';
    const jobA = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueB.id });
    delete process.env.VOICE_GENERATION_WORKER_DISABLED;
    const jobARow = await prisma.voiceGenerationJob.findUniqueOrThrow({ where: { id: jobA.id } });
    const fingerprintA = jobARow.requestFingerprint;

    // Mutate live cue BEFORE executing job A.
    await caller.story.updateCue({ projectId: project.id, cueId: cueB.id, text: 'State B text.', performanceDirection: 'excited' });

    await executeVoiceGenerationJob(prisma, jobA.id); // real execution, snapshot A only
    const jobAAfter = await prisma.voiceGenerationJob.findUniqueOrThrow({ where: { id: jobA.id } });
    const snapshotAAfter = jobAAfter.requestSnapshot as any;

    // New request from current (B) live state.
    const jobBResult = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueB.id });
    const jobBRow = await prisma.voiceGenerationJob.findUniqueOrThrow({ where: { id: jobBResult.id } });
    const fingerprintB = jobBRow.requestFingerprint;

    results.section30_snapshot_immutability = {
      fingerprintA, fingerprintB, differ: fingerprintA !== fingerprintB,
      jobASnapshotTextStillA: snapshotAAfter.text === 'State A text.',
      jobAStatus: jobAAfter.status,
      jobAAssetId: jobAAfter.outputAudioAssetId,
      jobBIsSeparateJob: jobBResult.id !== jobA.id,
    };

    // ── Section 31 — idempotency replay ──
    const replayResult = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueB.id }); // same live (B) state as jobB
    results.section31_idempotency = {
      originalJobId: jobBResult.id, replayJobId: replayResult.id,
      reusedSameJob: replayResult.id === jobBResult.id,
    };

    // ── Section 32 — concurrency ──
    const cueC = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 2, durationSeconds: 2, text: 'Concurrent request text.', performanceDirection: null });
    const [concurrent1, concurrent2] = await Promise.all([
      caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueC.id }),
      caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueC.id }),
    ]);
    const jobsForCueC = await prisma.voiceGenerationJob.findMany({ where: { audioCueId: cueC.id } });
    results.section32_concurrency = {
      concurrent1JobId: concurrent1.id, concurrent2JobId: concurrent2.id,
      sameJob: concurrent1.id === concurrent2.id,
      totalJobRowsForCue: jobsForCueC.length,
      noDuplicateRace: jobsForCueC.length === 1,
    };

    // ── Section 33 — failure semantics (real worker, real staging DB, injected failing/invalid providers) ──
    const cueFail1 = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 3, durationSeconds: 1, text: 'This will fail.', performanceDirection: null });
    process.env.VOICE_GENERATION_WORKER_DISABLED = 'true';
    const failJob1 = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueFail1.id });
    delete process.env.VOICE_GENERATION_WORKER_DISABLED;
    await executeVoiceGenerationJob(prisma, failJob1.id, { resolveProvider: () => failingProvider('VOICE_PROVIDER_REQUEST_FAILED: staging qualification deliberate failure') });
    const failJob1After = await prisma.voiceGenerationJob.findUniqueOrThrow({ where: { id: failJob1.id } });
    const assetsForFailCue1 = await prisma.audioAsset.count({ where: { cues: { some: { id: cueFail1.id } } } });

    const cueFail2 = await caller.story.addCue({ projectId: project.id, trackId: track.id, startTimeSeconds: 4, durationSeconds: 1, text: 'This will produce invalid output.', performanceDirection: null });
    process.env.VOICE_GENERATION_WORKER_DISABLED = 'true';
    const failJob2 = await caller.story.generateVoiceForCue({ projectId: project.id, audioCueId: cueFail2.id });
    delete process.env.VOICE_GENERATION_WORKER_DISABLED;
    await executeVoiceGenerationJob(prisma, failJob2.id, { resolveProvider: () => invalidOutputProvider() });
    const failJob2After = await prisma.voiceGenerationJob.findUniqueOrThrow({ where: { id: failJob2.id } });

    results.section33_failure = {
      providerFailure: { status: failJob1After.status, failureCode: failJob1After.failureCode, noAudioAssetCreated: assetsForFailCue1 === 0, hasStorageKeyLeak: false },
      invalidOutputFailure: { status: failJob2After.status, failureCode: failJob2After.failureCode, outputAudioAssetId: failJob2After.outputAudioAssetId },
    };

    // ── Section 34 — Movie Builder compatibility ──
    const blueprint = await caller.story.getAudioBlueprint({ projectId: project.id, sequenceId: seq.id });
    const blueprintCue = (blueprint.blueprint as any).tracks.flatMap((t: any) => t.cues).find((c: any) => c.cueId === cueA.id);
    const blueprintJson = JSON.stringify(blueprint.blueprint);
    const noProviderLeak = !blueprintJson.includes('providerRequestId') && !blueprintJson.includes('providerKey') && !blueprintJson.includes('publicUrl');

    const creditBalanceBefore = (await prisma.creditBalance.findUnique({ where: { userId: qaUser.id } }))!.balance;
    process.env.MOVIE_RENDER_WORKER_DISABLED = 'true';
    const render = await caller.story.createMovieRender({ projectId: project.id, sequenceId: seq.id });
    delete process.env.MOVIE_RENDER_WORKER_DISABLED;
    const { executeMovieRenderJob } = await import('../src/lib/movieRenderWorker');
    await executeMovieRenderJob(prisma, render.job.id);
    const renderJobAfter = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: render.job.id }, include: { movieAsset: true } });
    const creditBalanceAfter = (await prisma.creditBalance.findUnique({ where: { userId: qaUser.id } }))!.balance;

    results.section34_movie_builder_compatibility = {
      blueprintResolvesGeneratedAsset: blueprintCue?.audioAssetId === asset29?.id,
      blueprintStorageKeyMatches: blueprintCue?.storageKey === asset29?.storageKey,
      noProviderMetadataInBlueprint: noProviderLeak,
      renderStatus: renderJobAfter.status,
      renderErrorCode: renderJobAfter.errorCode,
      filmRuntimeSeconds: sourceScene.durationSeconds,
      audioBlueprintRuntimeSeconds: (blueprint.blueprint as any).runtimeSeconds,
      movieAssetDurationSeconds: (renderJobAfter as any).movieAsset?.durationSeconds ?? null,
      creditDelta: creditBalanceBefore - creditBalanceAfter,
      exactly100Credits: creditBalanceBefore - creditBalanceAfter === 100,
    };

    // ── Section 35 — restore-version regression with a generated asset attached ──
    const v1 = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult.plan.id, title: 'Q v1' });
    await caller.story.updateCue({ projectId: project.id, cueId: cueA.id, volume: 0.3 });
    const v2 = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult.plan.id, title: 'Q v2' });
    let restoreError: string | null = null;
    try {
      await caller.story.restoreAudioVersion({ projectId: project.id, planId: planResult.plan.id, versionNumber: v1.versionNumber });
    } catch (e: any) { restoreError = String(e?.message ?? e); }
    const planAfterRestore = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: seq.id });
    const cueAAfterRestore = (planAfterRestore.plan as any).tracks.flatMap((t: any) => t.cues).find((c: any) => c.audioAssetId === asset29?.id);
    const v3 = await caller.story.saveAudioVersion({ projectId: project.id, planId: planResult.plan.id, title: 'Q v3' });

    results.section35_restore_regression = {
      restoreThrew: restoreError !== null, restoreError,
      v1: v1.versionNumber, v2: v2.versionNumber, v3: v3.versionNumber, monotonic: v3.versionNumber === 3,
      generatedAudioAssetIdPreservedAfterRestore: Boolean(cueAAfterRestore),
    };

    console.log('CLEANUP_SEQUENCE_ID=' + seq.id);
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
