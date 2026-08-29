/**
 * Phase 9B.2B A/B snapshot qualification — step 14, persistence/reload
 * proof. Deliberately a SEPARATE process invocation with its own fresh
 * PrismaClient connection, run after phase9b2b-audio-ab-snapshot-
 * qualification.ts has already exited — the strongest practical proxy for
 * "survives a process restart" available to a script-based check: nothing
 * about job X/Y's snapshot data lives in this process's memory at all, it
 * is read back purely from Postgres.
 *
 * Usage: pnpm exec tsx scripts/phase9b2b-ab-snapshot-reload-check.ts <jobXId> <jobYId>
 */
import { PrismaClient } from '@raivstream/database';

async function main() {
  const [jobXId, jobYId] = process.argv.slice(2);
  if (!jobXId || !jobYId) throw new Error('Usage: phase9b2b-ab-snapshot-reload-check.ts <jobXId> <jobYId>');

  const prisma = new PrismaClient();
  try {
    const jobX = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: jobXId } });
    const jobY = await prisma.movieRenderJob.findUniqueOrThrow({ where: { id: jobYId } });
    console.log(JSON.stringify({
      ok: true,
      reloadedFromFreshProcess: true,
      jobX: {
        id: jobX.id,
        status: jobX.status,
        renderPlanHash: jobX.renderPlanHash,
        audioBlueprintHash: jobX.audioBlueprintHash,
        cueVolume: (jobX.audioBlueprintSnapshot as any)?.tracks?.[0]?.cues?.[0]?.volume,
      },
      jobY: {
        id: jobY.id,
        status: jobY.status,
        renderPlanHash: jobY.renderPlanHash,
        audioBlueprintHash: jobY.audioBlueprintHash,
        cueVolume: (jobY.audioBlueprintSnapshot as any)?.tracks?.[0]?.cues?.[0]?.volume,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
