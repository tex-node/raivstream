#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — production telemetry baseline (launch closure, Gate 4).
 *
 * Runs a bounded real-provider sample (one scene per project) and records the
 * user-facing stage latencies, then merges in every completed production run
 * already in the database. Emits real P50/P95 — not synthetic benchmarks.
 *
 * Usage: pnpm exec tsx scripts/phase9-telemetry-sample.ts --samples 4
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { intentService } from '../packages/api/src/lib/creative/intent/service';
import { projectService } from '../packages/api/src/lib/creative/project/service';
import { productionPlanService } from '../packages/api/src/lib/creative/production/service';
import { directorService } from '../packages/api/src/lib/creative/director/service';
import { approvalService } from '../packages/api/src/lib/creative/approval/service';
import { reviewService } from '../packages/api/src/lib/creative/review/service';
import { outputService } from '../packages/api/src/lib/creative/output/service';
import { runCreativeProduction } from '../packages/api/src/lib/creative/production/runner';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'apps', 'web', '.env.local'));
loadEnvFile(path.join(process.cwd(), 'packages', 'database', '.env'));

const prisma = new PrismaClient();
const N = Number(process.argv[process.argv.indexOf('--samples') + 1]) || 4;

const stages: Record<string, number[]> = {
  intent: [], plan: [], produce: [], firstVisual: [], review: [], direct: [], outputDerive: [], outputRender: [], propose: [], apply: [],
};

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  return { n: sorted.length, p50: at(50), p95: at(95), max: sorted[sorted.length - 1], avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) };
}

async function timed<T>(fn: () => Promise<T> | T): Promise<{ ms: number; value: T }> {
  const start = Date.now();
  const value = await fn();
  return { ms: Date.now() - start, value };
}

function boundPlan(plan: any, n: number) {
  const scenes = plan.scenes.slice(0, n).map((scene: any, index: number) => ({ ...scene, sceneId: `SCENE_${String(index + 1).padStart(2, '0')}`, order: index + 1 }));
  let cursor = 0;
  const timeline = scenes.map((scene: any) => { const start = cursor; cursor += scene.estimatedDurationSeconds; return { sceneId: scene.sceneId, startSeconds: start, endSeconds: cursor }; });
  return { ...plan, scenes, timeline, totalRuntimeSeconds: cursor };
}

async function ensureIntegrationUser(): Promise<string> {
  const email = 'integration-5@raivstream.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, username: 'integration5', displayName: 'Integration 5.0', passwordHash: 'integration-only', role: 'CREATOR' } });
  await prisma.creditBalance.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, balance: 100000 } });
  return user.id;
}

/** Real samples already in the database (completed runs only). */
async function mergeExistingRuns() {
  const runs = await prisma.creativeProductionRun.findMany({ where: { status: { in: ['COMPLETED', 'PARTIAL'] } }, orderBy: { startedAt: 'asc' } });
  for (const run of runs) {
    if (run.finishedAt) stages.produce.push(run.finishedAt.getTime() - run.startedAt.getTime());
    const firstImage = await prisma.creativeProducedAsset.findFirst({ where: { projectId: run.projectId, kind: 'IMAGE', status: 'READY', createdAt: { gte: run.startedAt } }, orderBy: { updatedAt: 'asc' } });
    if (firstImage) stages.firstVisual.push(firstImage.updatedAt.getTime() - run.startedAt.getTime());
  }
  return runs.length;
}

async function main() {
  const userId = await ensureIntegrationUser();
  console.log(JSON.stringify({ status: 'RUN', samples: N, userId }));
  for (let i = 0; i < N; i += 1) {
    try {
      const prompt = `Create a 1-minute cinematic scene ${i + 1} in a rain-soaked city at night.`;
      const intent = await timed(() => intentService.interpret(prompt)); stages.intent.push(intent.ms);
      const project = await projectService.createFromIntent(prisma as never, { userId, text: prompt, interpretation: intent.value });
      const plan = await timed(() => productionPlanService.plan(prisma as never, { projectId: project.id, userId })); stages.plan.push(plan.ms);
      await prisma.creativeProductionPlan.update({ where: { projectId: project.id }, data: { plan: boundPlan(plan.value.plan, 1) as never, version: { increment: 1 } } });
      await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });

      const runStart = Date.now();
      const produced = await timed(() => runCreativeProduction(prisma as never, { projectId: project.id })); stages.produce.push(produced.ms);
      const firstImage = await prisma.creativeProducedAsset.findFirst({ where: { projectId: project.id, kind: 'IMAGE', status: 'READY' }, orderBy: { updatedAt: 'asc' } });
      if (firstImage) stages.firstVisual.push(firstImage.updatedAt.getTime() - runStart);

      const review = await timed(() => reviewService.runReview(prisma as never, { projectId: project.id, userId })); stages.review.push(review.ms);
      const direct = await timed(() => directorService.direct(prisma as never, { projectId: project.id, userId, instruction: 'Warm scene 1.' })); stages.direct.push(direct.ms);
      await approvalService.decide(prisma as never, { projectId: project.id, versionId: direct.value.version.id, kind: 'CREATIVE', decision: 'approve', userId });
      const derived = await timed(() => outputService.derive(prisma as never, { projectId: project.id, versionId: direct.value.version.id, format: 'LANDSCAPE' })); stages.outputDerive.push(derived.ms);
      const rendered = await timed(() => outputService.render(prisma as never, { projectId: project.id, outputId: derived.value.output.id })); stages.outputRender.push(rendered.ms);
      const propose = await timed(() => directorService.propose(prisma as never, { projectId: project.id, userId, instruction: 'Make the lighting warmer.' })); stages.propose.push(propose.ms);
      const apply = await timed(() => directorService.applyInstruction(prisma as never, { projectId: project.id, userId, instruction: 'Warm scene 1.' })); stages.apply.push(apply.ms);

      console.log(JSON.stringify({ status: 'SAMPLE', index: i + 1, projectId: project.id, generated: produced.value.generated, failed: produced.value.failed, output: rendered.value.status }));
    } catch (error) {
      console.log(JSON.stringify({ status: 'SAMPLE_FAIL', index: i + 1, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  const existing = await mergeExistingRuns();
  console.log(JSON.stringify({ status: 'MERGED_EXISTING_RUNS', count: existing }));
  for (const [stage, samples] of Object.entries(stages)) {
    if (samples.length) console.log(JSON.stringify({ stage, ...stats(samples) }));
  }
  console.log(JSON.stringify({ status: 'COMPLETE' }));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ status: 'FATAL', error: error instanceof Error ? error.message : String(error) }));
  await prisma.$disconnect();
  process.exit(1);
});
