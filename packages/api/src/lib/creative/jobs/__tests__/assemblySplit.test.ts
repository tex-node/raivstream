import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREATIVE_ASSEMBLY_QUEUE, CREATIVE_PRODUCTION_QUEUE } from '../productionWorker';
import { outputService } from '../../output/service';

/**
 * The assembly split (2026-11-18) — wiring, not behaviour.
 *
 * The runner used to `await outputService.autoAssemble(...)` inside its own `finally`, so the production job stayed claimed
 * for the whole FFmpeg export (`batch done` arrived minutes after `run_finished`). These assertions pin the handoff: the
 * export is a separate queue with a separate handler, the production job no longer awaits it, and the sender's options are
 * the ones that make a retry safe (it is not: `autoAssemble` creates a new output row per call).
 *
 * The one behavioural test here is the plan lookup: an unknown project must be refused, not thrown at the queue.
 */

function source(candidates: string[], label: string): string {
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`${label} not found; tried:\n${candidates.join('\n')}`);
  return readFileSync(found, 'utf8');
}

const RUNNER = source([join(process.cwd(), 'src/lib/creative/production/runner.ts')], 'runner.ts');
const SENDER = source([join(process.cwd(), 'src/lib/creative/jobs/assemblyQueue.ts')], 'assemblyQueue.ts');
const SERVICE = source([join(process.cwd(), 'src/lib/creative/output/service.ts')], 'output/service.ts');
const WORKER = source(
  [join(process.cwd(), '../../scripts/creative-worker.ts'), join(process.cwd(), 'scripts/creative-worker.ts')],
  'creative-worker.ts',
);

describe('assembly is a separate job, not a tail on production', () => {
  it('has its own queue, distinct from the production queue', () => {
    expect(CREATIVE_ASSEMBLY_QUEUE).toBe('creative-assembly');
    expect(CREATIVE_ASSEMBLY_QUEUE).not.toBe(CREATIVE_PRODUCTION_QUEUE);
  });

  it('the runner hands off instead of awaiting the export', () => {
    expect(RUNNER).toContain('enqueueAssembly');
    expect(RUNNER).not.toContain('outputService.autoAssemble');
  });

  it('the handoff cannot make the run fail: the enqueue is caught and logged', () => {
    expect(RUNNER).toMatch(/enqueueAssembly\(\{ projectId: project\.id, runId \}\)\.catch/);
  });

  it('the sender never retries, because a retry would create a second output row', () => {
    expect(SENDER).toContain('retryLimit: 0');
    expect(SENDER).toMatch(/singletonKey: job\.projectId/);
  });

  it('the worker registers a handler for each queue', () => {
    expect(WORKER).toContain('boss.createQueue(CREATIVE_ASSEMBLY_QUEUE)');
    expect(WORKER).toContain('CREATIVE_ASSEMBLY_QUEUE,');
    expect(WORKER).toContain('CREATIVE_PRODUCTION_QUEUE,');
  });

  it('the assembly handler reloads the plan rather than trusting the payload', () => {
    expect(SERVICE).toMatch(/async assembleProject\(/);
    expect(SERVICE).toContain('include: { productionPlan: true }');
  });
});

describe('a graceful stop leaves no encoder behind', () => {
  it('the worker kills its children and stops the queues on a signal', () => {
    expect(WORKER).toContain('killAllChildren');
    expect(WORKER).toContain("process.on('SIGTERM'");
    expect(WORKER).toContain("process.on('SIGINT'");
    expect(WORKER).toContain('stopBoss');
  });

  it('a SIGKILL has no handler, so the reaper runs at boot and on a timer', () => {
    expect(WORKER).toContain('reapOrphanedRenders()');
    expect(WORKER).toMatch(/setInterval\(\(\) => \{[\s\S]{0,120}reapOrphanedRenders/);
  });
});

describe('assembleProject refuses what it cannot assemble', () => {
  it('returns blocked for a project with no plan, without querying further', async () => {
    const prisma = { creativeProject: { findUnique: async () => null } } as never;
    const result = await outputService.assembleProject(prisma, 'does-not-exist');
    expect(result).toEqual({ assembled: false, blocked: true, blockedScenes: [] });
  });
});
