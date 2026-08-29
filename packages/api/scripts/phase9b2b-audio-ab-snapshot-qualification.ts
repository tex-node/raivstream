/**
 * Phase 9B.2B — Immutable Audio A/B Render Snapshot Qualification.
 *
 * Real appRouter.createCaller against real staging Postgres, plus a REAL
 * execution of the render worker (real ffmpeg, no commandRunner override)
 * for Render X specifically — this is what makes "worker uses snapshot A
 * only" and "exact snapshot cue identities/storageKeys used" a live proof
 * rather than a structural inference.
 *
 * The fixture audio asset is a REAL disposable object uploaded to the app's
 * actual R2 bucket through the app's own `uploadBufferToR2` helper — not a
 * synthetic data: URI. An earlier version of this script blanked
 * R2_PUBLIC_URL to force the worker's storageKey resolution to fall through
 * to a data: URI when the "uploaded" object didn't really exist; that was
 * rejected on review as a test-fixture shortcut that exercised an unrelated
 * fallback path instead of the real storage path, and — more importantly —
 * risked normalizing "trust a canonical storageKey, then silently fall back
 * to something else when the real object is missing" as acceptable worker
 * behavior, which would undermine the snapshot identity guarantee this
 * checkpoint exists to prove. Fixed by actually uploading the fixture (see
 * below) instead. No worker/renderer code changed as part of this fix.
 *
 * There is no isolated staging object-storage bucket — staging and
 * production share the exact same R2 bucket/credentials/public URL
 * (confirmed via `.env` diff). Uploading (and deleting, on cleanup) one
 * small disposable QA-scoped audio object through this checkpoint was
 * explicitly authorized by the user for this reason.
 *
 * Fully isolated on a throwaway StorySequence that CLONES the shared QA
 * project's one real enabled scene (same storySceneId/selectedAssetId — a
 * proven-working visual reference, borrowed read-only, never mutated) —
 * learned the hard way in an earlier round: the shared sequence's audio plan
 * already carries other real tracks (e.g. "Forest Theme") whose asset
 * references are stale test fixtures from earlier rounds, and the STRICT
 * worker (rightly) fails the whole render over ANY unresolvable materialized
 * cue, not just this qualification's own. Isolating avoids that entirely and
 * keeps this test's audio identity unambiguous.
 *
 * Deliberately does NOT delete the throwaway sequence, AudioAsset row, or
 * uploaded R2 object in this script's own cleanup — that's deferred to
 * phase9b2b-ab-snapshot-cleanup.ts, run AFTER a separate, genuinely-fresh-
 * process reload check (phase9b2b-ab-snapshot-reload-check.ts) reads job
 * X/Y back from Postgres.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';
import { executeMovieRenderJob } from '../src/lib/movieRenderWorker';
import { hashAudioBlueprint, type AudioBlueprint } from '../src/lib/audioPlanning';
import { getPublicUrlForKey, uploadBufferToR2 } from '../src/lib/r2';
import { probeAudioAsset, type CommandRunner } from '../src/lib/audioMixing';

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

// Same shape as movieRenderWorker.ts's own (unexported) real CommandRunner —
// used here only for this script's OWN independent probes, never passed
// into the worker itself (executeMovieRenderJob uses its real internal
// runner with no override, per the file header above).
const realCommandRunner: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr}`))));
  });

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += String(c).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
}

async function synthTone(tempDir: string, durationSeconds: number): Promise<{ buffer: Buffer; localPath: string }> {
  const outPath = path.join(tempDir, 'ab-qual-tone.wav');
  await runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${durationSeconds}`, '-ar', '44100', '-ac', '2', outPath]);
  const buffer = await readFile(outPath);
  return { buffer, localPath: outPath };
}

function forbiddenFieldScan(obj: unknown, path: string, hits: string[]) {
  const FORBIDDEN = ['signedUrl', 'downloadUrl', 'tempFile', 'temporaryPath', 'workerId', 'resolvedAt', 'requestMetadata', 'publicUrl', 'url'];
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => forbiddenFieldScan(v, `${path}[${i}]`, hits));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN.includes(k)) hits.push(`${path}.${k}`);
    forbiddenFieldScan(v, `${path}.${k}`, hits);
  }
}

function findCueByCueId(blueprintSnapshot: any, cueId: string): any {
  for (const track of blueprintSnapshot?.tracks ?? []) {
    const cue = track.cues.find((c: any) => c.cueId === cueId);
    if (cue) return cue;
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  const results: Record<string, unknown> = {};
  const cleanup: Array<() => Promise<void>> = []; // everything EXCEPT the throwaway sequence/asset/R2 object
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'phase9b2b-ab-qual-'));

  try {
    const qaUser = await prisma.user.findUnique({ where: { email: QA_EMAIL } });
    if (!qaUser) throw new Error(`QA user ${QA_EMAIL} not found — refusing to run against an unexpected DB`);
    const project = await prisma.storyProject.findFirst({ where: { userId: qaUser.id }, orderBy: { createdAt: 'asc' } });
    if (!project) throw new Error('No StoryProject found for the QA user');
    const sourceSequence = await prisma.storySequence.findFirst({ where: { projectId: project.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
    if (!sourceSequence) throw new Error('No StorySequence found for the QA project');
    const sourceScene = await prisma.storySequenceScene.findFirst({ where: { sequenceId: sourceSequence.id, enabled: true }, orderBy: { orderIndex: 'asc' } });
    if (!sourceScene) throw new Error('No enabled StorySequenceScene found to clone a visual reference from');

    // ── 1. Isolated Film Blueprint V — a fresh sequence with one cloned, proven-working scene ──
    const throwawaySequence = await prisma.storySequence.create({
      data: { projectId: project.id, title: 'Phase9B2B A/B Snapshot Qualification (disposable)', status: 'DRAFT' },
    });
    await prisma.storySequenceScene.create({
      data: {
        sequenceId: throwawaySequence.id,
        storySceneId: sourceScene.storySceneId,
        orderIndex: 1,
        enabled: true,
        durationSeconds: sourceScene.durationSeconds,
        selectedAssetId: sourceScene.selectedAssetId,
        shotType: sourceScene.shotType,
        cameraMovement: sourceScene.cameraMovement,
        cameraSpeed: sourceScene.cameraSpeed,
        transition: 'NONE',
        transitionDurationSeconds: 0,
        holdDurationSeconds: 0,
      },
    });
    results.step1_visual_film_blueprint = { throwawaySequenceId: throwawaySequence.id, clonedFromSceneId: sourceScene.id, clonedAssetId: sourceScene.selectedAssetId, runtimeSeconds: sourceScene.durationSeconds };

    const ctx = buildContext(prisma, qaUser);
    const caller = appRouter.createCaller(ctx);

    // ── 1b. Generate the fixture locally, then push it through the REAL storage path ──
    const runtimeSeconds = sourceScene.durationSeconds;
    const { buffer: toneBuffer, localPath: toneLocalPath } = await synthTone(tempDir, runtimeSeconds);

    // Sanity check the fixture itself, pre-upload — isolates "ffmpeg/synth
    // produced bad audio" from anything storage- or snapshot-related.
    const localProbe = await probeAudioAsset(toneLocalPath, realCommandRunner);
    if (!localProbe.hasAudioStream) {
      throw new Error('FIXTURE_ERROR: locally generated synthetic tone has no audio stream — a fixture/ffmpeg problem, not a snapshot/worker problem.');
    }

    // Real disposable object, uploaded through the SAME helper
    // (`uploadBufferToR2`) the app itself uses to store real audio — not a
    // synthetic data: URI shortcut. Key is uniquely tagged per run so it's
    // unambiguous in bucket listings and safely deletable during cleanup.
    const runTag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storageKey = `story-projects/${project.id}/audio/ab-qualification/${runTag}.wav`;
    const uploadedPublicUrl = await uploadBufferToR2(toneBuffer, storageKey, 'audio/wav');
    if (!uploadedPublicUrl) {
      throw new Error('FIXTURE_ERROR: uploadBufferToR2 returned null — R2 is not configured in this environment; cannot run a real-storage-path qualification. Not a snapshot/worker defect.');
    }

    // The stable storageKey alone must re-derive the same canonical URL the
    // upload call returned — the same construction the worker itself uses
    // (getPublicUrlForKey), independent of the upload response.
    const rederivedUrl = getPublicUrlForKey(storageKey);
    results.step1c_fixture_upload = {
      storageKey,
      uploadedPublicUrl,
      rederivedUrl,
      rederivedMatchesUploaded: rederivedUrl === uploadedPublicUrl,
    };

    // Independently fetch + probe the REAL uploaded object over the network
    // (round-tripping through actual R2 storage) BEFORE creating Render X.
    // This is what lets the report distinguish a fixture/storage failure
    // from a snapshot/worker failure later on.
    const downloadedPath = path.join(tempDir, 'ab-qual-tone.downloaded.wav');
    const fetchRes = await fetch(rederivedUrl!);
    if (!fetchRes.ok) {
      throw new Error(`FIXTURE_ERROR: independent fetch of the uploaded object failed (${fetchRes.status}) — a storage upload/propagation problem, not a snapshot/worker defect.`);
    }
    await writeFile(downloadedPath, Buffer.from(await fetchRes.arrayBuffer()));
    const remoteProbe = await probeAudioAsset(downloadedPath, realCommandRunner);
    results.step1d_fixture_independent_verification = {
      fetchStatus: fetchRes.status,
      hasAudioStream: remoteProbe.hasAudioStream,
      durationSeconds: remoteProbe.durationSeconds,
      matchesExpectedDuration: remoteProbe.durationSeconds !== null && Math.abs(remoteProbe.durationSeconds - runtimeSeconds) <= 0.25,
    };
    if (!remoteProbe.hasAudioStream) {
      throw new Error('FIXTURE_ERROR: uploaded object failed independent probe after a real storage round-trip — a storage/upload defect, not a snapshot/worker defect.');
    }

    // ── 2. Audio Plan A — AudioAsset points at the REAL uploaded object ──
    const planResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: throwawaySequence.id });
    const planId = planResult.plan.id;
    const track = await caller.story.addTrack({ projectId: project.id, planId, type: 'MUSIC', name: 'A/B Snapshot Qualification Track' });

    const disposableAsset = await prisma.audioAsset.create({
      data: {
        projectId: project.id, userId: qaUser.id,
        storageKey, publicUrl: uploadedPublicUrl,
        mimeType: 'audio/wav', sourceKind: 'SYNTHETIC_TEST',
      },
    });

    const cueA = await caller.story.addCue({
      projectId: project.id, trackId: track.id, startTimeSeconds: 0, durationSeconds: runtimeSeconds,
      audioAssetId: disposableAsset.id, volume: 0.9, duckingEnabled: false,
    });

    const liveBlueprintA = await caller.story.getAudioBlueprint({ projectId: project.id, sequenceId: throwawaySequence.id });
    const hashA = hashAudioBlueprint(liveBlueprintA.blueprint as AudioBlueprint);

    // ── 3-5. Create Render X, delayed execution (worker disabled for THIS create call only) ──
    process.env.MOVIE_RENDER_WORKER_DISABLED = 'true';
    const renderX = await caller.story.createMovieRender({ projectId: project.id, sequenceId: throwawaySequence.id });
    delete process.env.MOVIE_RENDER_WORKER_DISABLED;
    const jobXId = renderX.job.id;

    const jobXAtCreation = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: jobXId } });
    const cueInXAtCreation = findCueByCueId(jobXAtCreation.audioBlueprintSnapshot, cueA.id);
    results.step4_capture_at_creation = {
      jobId: jobXId,
      status: jobXAtCreation.status, // expect QUEUED — never executed yet (step 5)
      renderPlanHash_X: jobXAtCreation.renderPlanHash, // render identity/idempotency key
      audioBlueprintHash_stored: jobXAtCreation.audioBlueprintHash,
      audioPlanVersionId: jobXAtCreation.audioPlanVersionId,
      H_A_computed_live: hashA,
      H_A_matches_stored: hashA === jobXAtCreation.audioBlueprintHash,
      cueA_in_snapshot: { volume: cueInXAtCreation?.volume, storageKey: cueInXAtCreation?.storageKey, audioAssetId: cueInXAtCreation?.audioAssetId },
      // The snapshot's storageKey must be the stable identity — its publicUrl
      // (transient/execution-time) must never enter the snapshot at all.
      snapshotContainsOnlyStableKey: cueInXAtCreation?.storageKey === storageKey && !('publicUrl' in (cueInXAtCreation ?? {})),
    };
    results.step5_delayed_execution_confirmed = jobXAtCreation.status === 'QUEUED';

    // ── 6-7. Modify live plan to B (material change: volume) — verify H(A) != H(B) ──
    await caller.story.updateCue({ projectId: project.id, cueId: cueA.id, volume: 0.3 });
    const liveBlueprintB = await caller.story.getAudioBlueprint({ projectId: project.id, sequenceId: throwawaySequence.id });
    const hashB = hashAudioBlueprint(liveBlueprintB.blueprint as AudioBlueprint);
    results.step6_7_hash_diverges = { H_A: hashA, H_B: hashB, differs: hashA !== hashB };

    // ── 8-9. Execute Render X for real (bypasses the queue-disable flag entirely — direct call) ──
    // With a REAL uploaded fixture and R2 genuinely configured throughout,
    // this should now reach READY end-to-end — download, probe, normalize,
    // mix, mux, post-mux verification, AND final output upload.
    await executeMovieRenderJob(prisma, jobXId);
    const jobXAfterExecution = await prisma.movieRenderJob.findUniqueOrThrow({
      where: { id: jobXId },
      include: { movieAsset: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    const movieAssetX = (jobXAfterExecution as any).movieAsset;
    const cueInXAfterExecution = findCueByCueId(jobXAfterExecution.audioBlueprintSnapshot, cueA.id);
    const stagesReached = (jobXAfterExecution as any).events.map((e: any) => e.stage);
    const AUDIO_TYPED_ERROR_CODES = [
      'AUDIO_ASSET_NOT_FOUND', 'AUDIO_ASSET_PROJECT_MISMATCH', 'AUDIO_ASSET_STORAGE_KEY_MISSING',
      'AUDIO_ASSET_STORAGE_KEY_MISMATCH', 'AUDIO_ASSET_PROBE_FAILED',
      'OUTPUT_DURATION_MISMATCH', 'OUTPUT_AUDIO_STREAM_MISSING', 'OUTPUT_AUDIO_VERIFICATION_FAILED',
    ];
    results.step8_9_execution_and_snapshot_used = {
      status: jobXAfterExecution.status, // expect READY
      errorCode: jobXAfterExecution.errorCode,
      errorMessage: jobXAfterExecution.errorMessage,
      stagesReached,
      audioTypedErrorEncountered: AUDIO_TYPED_ERROR_CODES.includes(String(jobXAfterExecution.errorCode)),
      // The snapshot's OWN recorded cue volume must still read 0.9 — the
      // live plan is at 0.3 by now. If the worker had re-read the live
      // plan, this render would either reflect 0.3 or fail differently.
      snapshotVolume_afterLiveEditToB: cueInXAfterExecution?.volume,
      snapshotUnchangedDespiteLiveEdit: cueInXAfterExecution?.volume === 0.9,
      hasAudio: movieAssetX?.metadata?.hasAudio ?? null,
      audioVerification_present: Boolean(movieAssetX?.metadata?.audioVerification),
      // inputAssetProbes should reference cueA's own id — proving the exact
      // snapshot cue identity (not something re-derived from the live plan)
      // was what actually got downloaded/mixed.
      inputAssetProbeCueIds: movieAssetX?.metadata?.audioVerification?.inputAssetProbes?.map((p: any) => p.cueId) ?? [],
      matchesCueA: (movieAssetX?.metadata?.audioVerification?.inputAssetProbes ?? []).some((p: any) => p.cueId === cueA.id),
    };

    // Static proof, re-confirmed live against the CURRENT file: the worker's
    // audio branch has exactly one source of audio data.
    {
      const workerSource = await readFile(path.join(process.cwd(), 'src', 'lib', 'movieRenderWorker.ts'), 'utf8');
      const liveReadCallSites = ['getAudioPlan(', 'audioPerformancePlan.findFirst', 'buildAudioBlueprint('].filter((needle) => workerSource.includes(needle));
      results.step9_no_live_read_static_proof = {
        onlySource: 'job.audioBlueprintSnapshot',
        liveReadCallSitesFoundInWorker: liveReadCallSites, // must be empty
      };
    }

    // ── 10-11. Create Render Y from current live plan B ──
    process.env.MOVIE_RENDER_WORKER_DISABLED = 'true';
    const renderY = await caller.story.createMovieRender({ projectId: project.id, sequenceId: throwawaySequence.id });
    delete process.env.MOVIE_RENDER_WORKER_DISABLED;
    const jobYId = renderY.job.id;
    const jobY = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: jobYId } });
    results.step10_11_render_Y = {
      jobId: jobYId,
      renderPlanHash_Y: jobY.renderPlanHash,
      isNewJob: jobYId !== jobXId,
      hashesDiffer_X_vs_Y: jobXAtCreation.renderPlanHash !== jobY.renderPlanHash,
    };

    // ── 12. Re-submit Visual V + Audio A (revert live cue back to A's exact content) ──
    await caller.story.updateCue({ projectId: project.id, cueId: cueA.id, volume: 0.9 });
    const renderReplayA = await caller.story.createMovieRender({ projectId: project.id, sequenceId: throwawaySequence.id });
    const replayRenderPlanHash = (await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: renderReplayA.job.id } })).renderPlanHash;
    results.step12_replay_A_reuses_X = {
      reused: renderReplayA.reused,
      jobId: renderReplayA.job.id,
      matchesX_byRowId: renderReplayA.job.id === jobXId,
      replayRenderPlanHash,
      matchesX_byIdentity: replayRenderPlanHash === jobXAtCreation.renderPlanHash,
      matchesY_byIdentity: replayRenderPlanHash === jobY.renderPlanHash,
    };

    // ── 13. Mutate live plan again AFTER Y exists — Y's stored snapshot must not move ──
    await caller.story.updateCue({ projectId: project.id, cueId: cueA.id, volume: 0.5 });
    const jobYAfterFurtherEdit = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: jobYId } });
    const cueInYAfterFurtherEdit = findCueByCueId(jobYAfterFurtherEdit.audioBlueprintSnapshot, cueA.id);
    results.step13_Y_snapshot_immutable = {
      volumeInY_snapshot: cueInYAfterFurtherEdit?.volume,
      stillMatchesOriginalB: cueInYAfterFurtherEdit?.volume === 0.3,
    };
    // Revert live plan back to A for a clean final state.
    await caller.story.updateCue({ projectId: project.id, cueId: cueA.id, volume: 0.9 });

    // ── 15. Snapshot field allowlist — scan the REAL persisted JSON for forbidden fields ──
    const forbiddenHits: string[] = [];
    forbiddenFieldScan(jobXAfterExecution.audioBlueprintSnapshot, 'jobX.audioBlueprintSnapshot', forbiddenHits);
    forbiddenFieldScan(jobYAfterFurtherEdit.audioBlueprintSnapshot, 'jobY.audioBlueprintSnapshot', forbiddenHits);
    results.step15_snapshot_field_allowlist = {
      forbiddenFieldsFound: forbiddenHits, // must be empty
      sampleCueKeys: Object.keys(cueInXAfterExecution ?? {}),
    };

    console.log('THROWAWAY_SEQUENCE_ID=' + throwawaySequence.id);
    console.log('JOB_X_ID=' + jobXId);
    console.log('JOB_Y_ID=' + jobYId);
    console.log('ASSET_ID=' + disposableAsset.id); // AudioAsset is scoped to the project, not the sequence — the cascade delete of the throwaway sequence will NOT remove it; the final cleanup script deletes it explicitly.
    console.log('R2_STORAGE_KEY=' + storageKey); // real uploaded object — cleanup script deletes it from R2 explicitly.
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch (e) { console.error('[cleanup] failed:', e); }
    }
    await rm(tempDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main();
