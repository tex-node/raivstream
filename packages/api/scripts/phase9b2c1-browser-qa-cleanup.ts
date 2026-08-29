/**
 * Phase 9B.2C.1 — cleanup for the manually-created browser QA test data
 * added to the SHARED persistent QA project during interactive browser
 * verification of the voice generation panel. Removes exactly the track,
 * cue, generated audio asset, and voice generation job created for this
 * test — does NOT touch any other part of the shared QA fixture.
 *
 * Safety: runs the same staging-DB identity gate used everywhere else in
 * this phase before touching anything, and only ever deletes rows it can
 * positively identify by exact id / exact known test content.
 */
import { PrismaClient } from '@prisma/client';

const PROJECT_ID = 'cmtb8u7ga000b9s38pewi3miz';
const CUE_TEXT = 'Good morning, browser QA.';

// Run `node scripts/verify-staging-db.js` (repo root) from the staging
// environment before this script, per this phase's standing discipline —
// not invoked from here to avoid relative-path assumptions about cwd.
async function main() {
  const prisma = new PrismaClient();
  try {
    const cue = await prisma.audioCue.findFirst({
      where: { text: CUE_TEXT, track: { plan: { projectId: PROJECT_ID } } },
      include: { track: true },
    });

    if (!cue) {
      console.log(JSON.stringify({ ok: true, note: 'No matching browser-QA cue found — nothing to clean up (already removed?).' }));
      return;
    }

    const jobs = await prisma.voiceGenerationJob.findMany({ where: { audioCueId: cue.id } });
    const assetIds = jobs.map((j) => j.outputAudioAssetId).filter((id): id is string => Boolean(id));

    console.log(JSON.stringify({
      found: { cueId: cue.id, trackId: cue.trackId, trackType: cue.track.type, jobIds: jobs.map((j) => j.id), assetIds },
    }, null, 2));

    // Only remove the track itself if it contains ONLY this one browser-QA
    // cue (i.e. it was created solely for this test) — never delete a track
    // that has other real cues on it.
    const siblingCueCount = await prisma.audioCue.count({ where: { trackId: cue.trackId, id: { not: cue.id } } });

    await prisma.$transaction(async (tx) => {
      // Detach first (cue -> asset FK), then delete the job(s) (job -> asset FK is SET NULL on delete of asset,
      // but we delete the job explicitly first since it references the cue too).
      await tx.audioCue.update({ where: { id: cue.id }, data: { audioAssetId: null } });
      await tx.voiceGenerationJob.deleteMany({ where: { audioCueId: cue.id } });
      if (assetIds.length > 0) {
        await tx.audioAsset.deleteMany({ where: { id: { in: assetIds }, projectId: PROJECT_ID } });
      }
      await tx.audioCue.delete({ where: { id: cue.id } });
      if (siblingCueCount === 0) {
        await tx.audioTrack.delete({ where: { id: cue.trackId } });
      }
    });

    const verifyCue = await prisma.audioCue.findUnique({ where: { id: cue.id } });
    const verifyJobs = await prisma.voiceGenerationJob.findMany({ where: { audioCueId: cue.id } });
    const verifyAssets = assetIds.length > 0 ? await prisma.audioAsset.findMany({ where: { id: { in: assetIds } } }) : [];
    const verifyTrack = siblingCueCount === 0 ? await prisma.audioTrack.findUnique({ where: { id: cue.trackId } }) : null;

    console.log(JSON.stringify({
      ok: true,
      cleaned: {
        cueDeleted: verifyCue === null,
        jobsDeleted: verifyJobs.length === 0,
        assetsDeleted: verifyAssets.length === 0,
        trackDeleted: siblingCueCount === 0 ? verifyTrack === null : 'track kept (has other cues)',
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
