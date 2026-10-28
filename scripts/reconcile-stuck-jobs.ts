/**
 * Ops script: reconcile generation jobs stranded in GENERATING.
 *
 * Use when the database or the polling worker was unavailable long enough for
 * the provider to finish a render that we never recorded.
 *
 *   pnpm tsx scripts/reconcile-stuck-jobs.ts          # dry run
 *   pnpm tsx scripts/reconcile-stuck-jobs.ts --apply  # mirror to R2 and update rows
 */

import { prisma } from '../packages/database/index';
import { reconcileStuckJobs } from '../packages/api/src/lib/jobReconciliation';
import { refundCredits } from '../packages/api/src/lib/credits';

async function main() {
  const apply = process.argv.includes('--apply');

  if (!apply) {
    const stuck = await prisma.generationJob.findMany({
      where: { status: 'GENERATING', createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
      select: { id: true, model: true, providerJobId: true, createdAt: true },
    });
    console.log(`[reconcile] dry run - ${stuck.length} job(s) older than 15 min in GENERATING:`);
    for (const job of stuck) {
      console.log(`  ${job.id} ${job.model} provider=${job.providerJobId ?? 'none'} created=${job.createdAt.toISOString()}`);
    }
    console.log('\nRe-run with --apply to mirror completed renders to R2 and update rows.');
    return;
  }

  const summary = await reconcileStuckJobs({
    prisma: prisma as never,
    refund: async (job) => {
      // The debit that paid for this job carries the amount and the feature key.
      const debit = await prisma.creditTransaction.findFirst({
        where: { referenceId: String(job.id), amount: { lt: 0 } },
        select: { amount: true, featureKey: true },
      });
      const cost = Math.abs(debit?.amount ?? Number(job.creditsUsed ?? 0));
      const featureKey = debit?.featureKey ?? null;
      if (!featureKey || cost <= 0) {
        console.warn('[reconcile] cannot refund job without a matching debit', job.id);
        return;
      }
      await refundCredits(
        prisma,
        String(job.userId),
        cost,
        featureKey,
        String(job.id),
        'Refund: render failed (reconciled)',
        `reconcile-refund-${job.id}`,
      );
    },
  });

  console.log('[reconcile] done');
  console.log(`  fixed=${summary.fixed} failed=${summary.failed} stillPending=${summary.stillPending} skipped=${summary.skipped}`);
  for (const outcome of summary.outcomes) {
    console.log(`  - ${outcome.jobId} ${outcome.model} => ${outcome.outcome}${outcome.reason ? ` (${outcome.reason})` : ''}${outcome.outputUrl ? `\n    ${outcome.outputUrl}` : ''}`);
  }
}

main()
  .catch((error) => {
    console.error('[reconcile] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
