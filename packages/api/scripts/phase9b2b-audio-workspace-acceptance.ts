/**
 * Phase 9B.2B Audio Workspace acceptance walkthrough.
 *
 * Exercises the REAL tRPC procedures (via appRouter.createCaller) against the
 * REAL staging Postgres database, driving the exact same procedures the
 * Nocturne Audio tab UI calls. This is the functional half of the
 * acceptance criteria — browser screenshot verification is blocked in this
 * environment by a network-isolation issue between the automation tooling
 * and this machine's loopback interface (confirmed with a fresh, never-
 * visited port and a trivial HTTP server — not an HSTS/cert issue).
 *
 * Everything this script creates is deleted again in a `finally` block.
 */
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';

process.env.MOVIE_RENDER_WORKER_DISABLED = 'true';

const QA_EMAIL = 'phase9b2-qa@raivstream.test';

function buildContext(prisma: PrismaClient, user: any, isR16 = false): Context {
  return {
    prisma,
    userId: user.id,
    isR16,
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
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const qaUser = await prisma.user.findUnique({ where: { email: QA_EMAIL } });
    if (!qaUser) throw new Error(`QA user ${QA_EMAIL} not found — refusing to run against an unexpected DB`);

    const project = await prisma.storyProject.findFirst({ where: { userId: qaUser.id }, orderBy: { createdAt: 'asc' } });
    if (!project) throw new Error('No StoryProject found for the QA user');
    const sequence = await prisma.storySequence.findFirst({ where: { projectId: project.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } });
    if (!sequence) throw new Error('No StorySequence found for the QA project');

    const ctx = buildContext(prisma, qaUser, false);
    const caller = appRouter.createCaller(ctx);
    const r16Ctx = buildContext(prisma, qaUser, true);
    const r16Caller = appRouter.createCaller(r16Ctx);

    // ── R16 hiding (server-side enforcement — client tab hiding is a UI conditional, verified by code read) ──
    {
      const plan = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
      let r16Denied = false;
      let r16Code: string | null = null;
      try {
        await r16Caller.story.addTrack({ projectId: project.id, planId: plan.plan.id, type: 'SFX', name: 'R16 probe' });
      } catch (e: any) {
        r16Denied = true;
        r16Code = e?.code ?? null;
      }
      results.r16_hiding = { serverSideDenied: r16Denied, code: r16Code };
    }

    // ── Film preflight on the shared QA project, BEFORE this walkthrough adds
    // its own tracks — note this project already carries real audio content
    // from earlier qualification rounds, so this is "preflight with
    // pre-existing audio," not a silent state (see preflight_silent_state
    // below, on a genuinely empty isolated sequence, for that case). ──
    const preflightBefore = await caller.story.getMovieBuilder({ projectId: project.id, sequenceId: sequence.id });
    results.preflight_before_this_walkthroughs_edits = {
      ready: (preflightBefore as any).readiness?.ready,
      warnings: (preflightBefore as any).readiness?.warnings ?? [],
      hasAudio: (preflightBefore as any).hasAudio,
    };

    // ── Build the five-lane populated state ──
    const planResult = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
    const planId = planResult.plan.id;

    // A disposable character + voice profile, so "Character selection" and
    // "Voice Profile" render with real names, matching the acceptance mockup.
    const character = await caller.story.createCharacterMemory({
      projectId: project.id,
      name: 'Max',
      role: 'Curious young dog',
      visualDescription: 'A small golden puppy with a red backpack, big curious eyes, and floppy ears.',
    });
    cleanup.push(async () => { await prisma.storyCharacterMemory.deleteMany({ where: { id: character.id } }); });

    const voiceProfile = await caller.story.createVoiceProfile({
      projectId: project.id,
      characterMemoryId: character.id,
      name: 'Max — Curious Young Voice',
      voiceType: 'young_male',
    });
    cleanup.push(async () => { await prisma.voiceProfile.deleteMany({ where: { id: voiceProfile.id } }); });

    // One real, disposable AudioAsset so at least one cue demonstrates the
    // MATERIALIZED "Audio source: Attached" state, not just "Not generated".
    const disposableAsset = await prisma.audioAsset.create({
      data: {
        projectId: project.id, userId: qaUser.id,
        storageKey: `story-projects/${project.id}/audio/acceptance-ambience.wav`,
        publicUrl: 'https://cdn.test/acceptance-ambience.wav',
        mimeType: 'audio/wav', sourceKind: 'SYNTHETIC_TEST',
      },
    });
    cleanup.push(async () => { await prisma.audioAsset.deleteMany({ where: { id: disposableAsset.id } }); });

    const trackTypes: Array<{ type: 'NARRATION' | 'DIALOGUE' | 'AMBIENCE' | 'SFX' | 'MUSIC'; name: string }> = [
      { type: 'NARRATION', name: 'Narration' },
      { type: 'DIALOGUE', name: 'Dialogue' },
      { type: 'AMBIENCE', name: 'Ambience' },
      { type: 'SFX', name: 'SFX' },
      { type: 'MUSIC', name: 'Music' },
    ];
    const tracks: Record<string, any> = {};
    for (const t of trackTypes) {
      const track = await caller.story.addTrack({ projectId: project.id, planId, type: t.type, name: t.name });
      tracks[t.type] = track;
      cleanup.push(async () => { await prisma.audioTrack.deleteMany({ where: { id: track.id } }); });
    }

    const narrationCue = await caller.story.addCue({
      projectId: project.id, trackId: tracks.NARRATION.id, startTimeSeconds: 0, durationSeconds: 4,
      text: 'Once upon a time, a curious young dog named Max set off for his very first day of school.',
      volume: 1, fadeInSeconds: 0.2, fadeOutSeconds: 0.2, duckingEnabled: false,
    });
    const dialogueCue = await caller.story.addCue({
      projectId: project.id, trackId: tracks.DIALOGUE.id, startTimeSeconds: 4.2, durationSeconds: 2.4,
      characterMemoryId: character.id, voiceProfileId: voiceProfile.id,
      text: "Wait for me!", performanceDirection: 'Excited',
      volume: 0.9, fadeInSeconds: 0.15, fadeOutSeconds: 0.25, duckingEnabled: false,
    });
    const ambienceCue = await caller.story.addCue({
      projectId: project.id, trackId: tracks.AMBIENCE.id, startTimeSeconds: 0, durationSeconds: 12,
      audioAssetId: disposableAsset.id, // materialized
      volume: 0.6, duckingEnabled: true, duckingAmountDb: 8,
    });
    const sfxCue = await caller.story.addCue({
      projectId: project.id, trackId: tracks.SFX.id, startTimeSeconds: 6, durationSeconds: 0.5,
      text: 'door', volume: 1, duckingEnabled: false,
    });
    const musicCue = await caller.story.addCue({
      projectId: project.id, trackId: tracks.MUSIC.id, startTimeSeconds: 0, durationSeconds: 12,
      volume: 0.5, fadeInSeconds: 1, fadeOutSeconds: 1.5, duckingEnabled: true, duckingAmountDb: 8,
    });
    for (const cueId of [narrationCue.id, dialogueCue.id, ambienceCue.id, sfxCue.id, musicCue.id]) {
      cleanup.push(async () => { await prisma.audioCue.deleteMany({ where: { id: cueId } }); });
    }

    // ── Read back exactly what the UI's getAudioPlan query would show ──
    const populated = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
    const populatedTracks = (populated.plan as any).tracks;
    results.five_lanes_present = populatedTracks.map((t: any) => ({ type: t.type, cueCount: t.cues.length }));

    const dialogueCueRead = populatedTracks.find((t: any) => t.type === 'DIALOGUE').cues[0];
    results.dialogue_cue_inspector_fields = {
      characterMemoryId: dialogueCueRead.characterMemoryId,
      characterMatches: dialogueCueRead.characterMemoryId === character.id,
      voiceProfileId: dialogueCueRead.voiceProfileId,
      voiceProfileMatches: dialogueCueRead.voiceProfileId === voiceProfile.id,
      performanceDirection: dialogueCueRead.performanceDirection,
      startTimeSeconds: dialogueCueRead.startTimeSeconds,
      durationSeconds: dialogueCueRead.durationSeconds,
      volume: dialogueCueRead.volume,
      fadeInSeconds: dialogueCueRead.fadeInSeconds,
      fadeOutSeconds: dialogueCueRead.fadeOutSeconds,
      audioSourceState: dialogueCueRead.audioAssetId ? 'Attached' : 'Not generated', // matches the exact UI string
    };
    const ambienceCueRead = populatedTracks.find((t: any) => t.type === 'AMBIENCE').cues[0];
    results.ambience_cue_materialized_state = {
      audioAssetId: ambienceCueRead.audioAssetId,
      audioSourceState: ambienceCueRead.audioAssetId ? 'Attached' : 'Not generated',
    };

    // ── Runtime + version header ──
    const blueprintResult = await caller.story.getAudioBlueprint({ projectId: project.id, sequenceId: sequence.id });
    results.runtime_and_version_header = {
      runtimeSeconds: (blueprintResult.blueprint as any).runtimeSeconds,
      currentVersionNumber: (populated.plan as any).currentVersionNumber,
    };

    // ── Film preflight, WITH audio content (some materialized, some not) — should now report the unmaterialized-cues warning ──
    const preflightAfter = await caller.story.getMovieBuilder({ projectId: project.id, sequenceId: sequence.id });
    results.preflight_after_audio = {
      ready: (preflightAfter as any).readiness?.ready,
      warnings: (preflightAfter as any).readiness?.warnings ?? [],
      hasAudio: (preflightAfter as any).hasAudio,
    };

    // ── Editable fields: mutate, then re-fetch ("refresh persistence") ──
    await caller.story.updateCue({ projectId: project.id, cueId: dialogueCue.id, startTimeSeconds: 5, volume: 0.75, enabled: false });
    const afterEdit = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: sequence.id });
    const dialogueAfterEdit = (afterEdit.plan as any).tracks.find((t: any) => t.type === 'DIALOGUE').cues[0];
    results.edit_and_refresh_persistence = {
      startTimeSeconds: dialogueAfterEdit.startTimeSeconds,
      volume: dialogueAfterEdit.volume,
      enabled: dialogueAfterEdit.enabled,
      matchesEditedValues: dialogueAfterEdit.startTimeSeconds === 5 && dialogueAfterEdit.volume === 0.75 && dialogueAfterEdit.enabled === false,
    };

    // ── Save Version / Restore ──
    // restoreAudioVersion deletes and recreates EVERY track in the plan, not
    // just the ones a given save touched — running it against the shared QA
    // plan (which already has real pre-existing tracks from earlier rounds)
    // would churn every existing row's identity. Isolated the same way the
    // Phase 9B.2B persistence checkpoint did: a fully disposable throwaway
    // sequence/plan, cascade-deleted at the end, so restore's destructive
    // semantics can never touch anything outside this one test.
    {
      const throwawaySequence = await prisma.storySequence.create({
        data: { projectId: project.id, title: 'Phase9B2B Acceptance Walkthrough — Version Restore (disposable)' },
      });
      cleanup.push(async () => { await prisma.storySequence.deleteMany({ where: { id: throwawaySequence.id } }); }); // cascades plan/tracks/cues/versions

      const isolatedPlan = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: throwawaySequence.id });
      const isolatedPlanId = isolatedPlan.plan.id;

      // Genuinely silent preflight: this fresh, isolated sequence has zero
      // scenes and zero audio tracks — a real "silent" state, unlike the
      // shared QA plan checked earlier (which already has real audio content
      // from earlier qualification rounds, so that check demonstrates
      // "preflight with pre-existing audio," not "silent").
      const preflightSilent = await caller.story.getMovieBuilder({ projectId: project.id, sequenceId: throwawaySequence.id });
      results.preflight_silent_state = {
        ready: (preflightSilent as any).readiness?.ready,
        warnings: (preflightSilent as any).readiness?.warnings ?? [],
        hasAudio: (preflightSilent as any).hasAudio,
      };
      const isolatedTrack = await caller.story.addTrack({ projectId: project.id, planId: isolatedPlanId, type: 'DIALOGUE', name: 'Dialogue' });
      const isolatedCue = await caller.story.addCue({
        projectId: project.id, trackId: isolatedTrack.id, startTimeSeconds: 4.2, durationSeconds: 2.4,
        characterMemoryId: character.id, voiceProfileId: voiceProfile.id,
        text: 'Wait for me!', performanceDirection: 'Excited', volume: 0.9, duckingEnabled: false,
      });

      // v1 is saved HERE, capturing volume=0.9 — restore must bring it back
      // to exactly that value, not whatever it's changed to afterward.
      const volumeAtSaveTime = 0.9;
      const v1 = await caller.story.saveAudioVersion({ projectId: project.id, planId: isolatedPlanId, title: 'Acceptance walkthrough v1' });
      await caller.story.updateCue({ projectId: project.id, cueId: isolatedCue.id, volume: 0.3 });
      const beforeRestore = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: throwawaySequence.id });
      const volumeBeforeRestore = (beforeRestore.plan as any).tracks[0].cues[0].volume;
      await caller.story.restoreAudioVersion({ projectId: project.id, planId: isolatedPlanId, versionNumber: v1.versionNumber });
      const afterRestore = await caller.story.getAudioPlan({ projectId: project.id, sequenceId: throwawaySequence.id });
      const dialogueAfterRestore = (afterRestore.plan as any).tracks[0].cues[0];

      results.save_version_and_restore = {
        savedVersionNumber: v1.versionNumber,
        volumeAtSaveTime,
        volumeBeforeRestore,
        volumeAfterRestore: dialogueAfterRestore.volume,
        restoredToSavedValue: dialogueAfterRestore.volume === volumeAtSaveTime,
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
