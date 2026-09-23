#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — Phase 9 live smoke.
 *
 * Exercises the Phase 9 completion gate against the DEPLOYED system with REAL
 * services, REAL database and REAL fal providers:
 *
 *   P · CREATE → PLAN → PREVIEW → PRODUCE → FIRST_VISUAL → REVIEW →
 *       DIRECT.propose → APPLY → TARGETED REGENERATION → APPROVAL → OUTPUT
 *   X · Studio context participates in production (inherited brand reaches the
 *       real generation prompt)
 *   R · Recovery: a producer process is killed mid-run → the run goes STALE →
 *       RECOVER resumes it → READY, and completed assets are NOT regenerated.
 *
 * Runs on the VPS from the repo root with the app env (apps/web/.env.local).
 * Creates an isolated integration user with a funded balance so real generation
 * costs are not charged to a real creator. Productions are bounded to 1–2 scenes.
 *
 * Usage:
 *   pnpm exec tsx scripts/phase9-live-smoke.ts            # run P, X, R
 *   pnpm exec tsx scripts/phase9-live-smoke.ts --journey P
 *   pnpm exec tsx scripts/phase9-live-smoke.ts --produce <projectId>   # child worker
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { intentService } from '../packages/api/src/lib/creative/intent/service';
import { projectService } from '../packages/api/src/lib/creative/project/service';
import { productionPlanService } from '../packages/api/src/lib/creative/production/service';
import { directorService } from '../packages/api/src/lib/creative/director/service';
import { approvalService } from '../packages/api/src/lib/creative/approval/service';
import { reviewService } from '../packages/api/src/lib/creative/review/service';
import { outputService } from '../packages/api/src/lib/creative/output/service';
import { studioService } from '../packages/api/src/lib/creative/studio/service';
import { runCreativeProduction, recoverStuckProductions } from '../packages/api/src/lib/creative/production/runner';
import { routeProduction } from '../packages/api/src/lib/creative/production/capabilityRouter';
import { generateStill, generateVideo, extractLastFrame } from '../packages/api/src/lib/creative/production/generationAdapter';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
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
const FAILED: string[] = [];

function ok(label: string) { console.log(JSON.stringify({ status: 'PASS', step: label })); }
function fail(label: string, error: unknown) {
  console.log(JSON.stringify({ status: 'FAIL', step: label, error: error instanceof Error ? error.message : String(error) }));
  FAILED.push(label);
}
function assert(condition: boolean, label: string, error: string) {
  if (!condition) throw new Error(`[${label}] ${error}`);
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Trim a plan to n scenes (recompute timeline) to bound real-media cost/time. */
function boundPlan(plan: any, n: number) {
  const scenes = plan.scenes.slice(0, n).map((scene: any, index: number) => ({ ...scene, sceneId: `SCENE_${String(index + 1).padStart(2, '0')}`, order: index + 1 }));
  let cursor = 0;
  const timeline = scenes.map((scene: any) => {
    const start = cursor;
    const end = start + scene.estimatedDurationSeconds;
    cursor = end;
    return { sceneId: scene.sceneId, startSeconds: start, endSeconds: end };
  });
  return { ...plan, scenes, timeline, totalRuntimeSeconds: cursor };
}

async function ensureIntegrationUser(): Promise<string> {
  const email = 'integration-5@raivstream.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, username: 'integration5', displayName: 'Integration 5.0', passwordHash: 'integration-only', role: 'CREATOR' } });
  }
  await prisma.creditBalance.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, balance: 100000 } });
  return user.id;
}

async function persistTrimmed(projectId: string, plan: any, n: number) {
  const trimmed = boundPlan(plan, n);
  await prisma.creativeProductionPlan.update({ where: { projectId }, data: { plan: trimmed as never, version: { increment: 1 } } });
  return trimmed;
}

// ─── Journey P — the full Phase 9 loop ────────────────────────────────────────
async function journeyP(userId: string) {
  ok('JOURNEY P — CREATE→PLAN→PREVIEW→PRODUCE→FIRST_VISUAL→REVIEW→PROPOSE→APPLY→TARGETED REGEN→APPROVAL→OUTPUT');
  const prompt = 'Create a 2-minute cinematic short film about a Lagos street musician who finds a lost violin.';
  const interpretation = intentService.interpret(prompt);
  assert(interpretation.projectType === 'STORY', 'P:intent', `expected STORY, got ${interpretation.projectType}`);
  const project = await projectService.createFromIntent(prisma as never, { userId, text: prompt, interpretation });
  assert(Boolean(project.bible), 'P:bible', 'no bible seeded');
  ok('P:CREATE → intent interpreted, brief + bible created');

  const built = await productionPlanService.plan(prisma as never, { projectId: project.id, userId });
  assert(built.plan.scenes.length >= 2, 'P:plan', 'plan has < 2 scenes');
  assert(built.preview.scenes.length === built.plan.scenes.length, 'P:preview', 'preview scenes missing');
  const trimmed = await persistTrimmed(project.id, built.plan, 2);
  ok(`P:PLAN + PREVIEW → ${trimmed.scenes.length} scenes / ${built.preview.scenes.length} preview scenes`);

  await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });
  const started = Date.now();
  const produced = await runCreativeProduction(prisma as never, { projectId: project.id });
  assert(produced.status !== 'FAILED', 'P:produce', `production failed (${produced.status})`);
  ok(`P:PRODUCE → ${produced.generated} ready, ${produced.failed} failed (run ${produced.runId ?? 'n/a'})`);

  const firstImage = await prisma.creativeProducedAsset.findFirst({ where: { projectId: project.id, kind: 'IMAGE', status: 'READY' }, orderBy: { updatedAt: 'asc' } });
  assert(Boolean(firstImage), 'P:first-visual', 'no READY image');
  ok(`P:FIRST_VISUAL → ${Math.round((firstImage!.updatedAt.getTime() - started) / 1000)}s to first meaningful visual`);

  const runs = await reviewService.runReview(prisma as never, { projectId: project.id, userId });
  ok(`P:REVIEW → ${runs.length} run(s), ${runs.filter((r) => r.status === 'COMPLETED').length} completed`);

  const versionsBefore = await prisma.creativeVersion.count({ where: { projectId: project.id } });
  const proposal = await directorService.propose(prisma as never, { projectId: project.id, userId, instruction: 'Warm scene 1.' });
  const versionsAfter = await prisma.creativeVersion.count({ where: { projectId: project.id } });
  assert(versionsAfter === versionsBefore, 'P:propose-side-effects', 'propose created a version');
  assert(proposal.decision.affectedSceneIds.length === 1, 'P:propose-impact', `expected 1 affected scene, got ${proposal.decision.affectedSceneIds.length}`);
  ok(`P:DIRECT.propose → "${proposal.decision.interpretation}" · preserves [${proposal.decision.preserves.slice(0, 3).join(', ')}] · affects ${proposal.decision.affectedSceneIds.length} scene (no side effects)`);

  const before = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } });
  const unaffectedBefore = before.filter((a) => a.sceneId !== trimmed.scenes[0].sceneId).map((a) => ({ id: a.id, url: a.assetUrl }));

  const applied = await directorService.applyInstruction(prisma as never, { projectId: project.id, userId, instruction: 'Warm scene 1.' });
  assert(applied.applied && applied.affectedSceneIds.length === 1, 'P:apply', 'apply did not target exactly one scene');
  const afterApply = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } });
  assert(afterApply.length === before.length - 2, 'P:apply-delete', `expected affected scene assets dropped (before ${before.length}, after ${afterApply.length})`);
  ok(`P:APPLY → version snapshotted, ${applied.affectedSceneIds.length} scene marked, unaffected assets preserved`);

  const regen = await runCreativeProduction(prisma as never, { projectId: project.id });
  assert(regen.generated === 2, 'P:targeted-regen', `expected 2 regenerated assets, got ${regen.generated}`);
  const afterRegen = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } });
  for (const prior of unaffectedBefore) {
    const current = afterRegen.find((a) => a.id === prior.id);
    assert(Boolean(current) && current!.assetUrl === prior.url, 'P:unaffected-untouched', `unaffected asset ${prior.id} was regenerated`);
  }
  ok(`P:TARGETED REGENERATION → ${regen.generated} regenerated; unaffected scenes untouched`);

  await approvalService.decide(prisma as never, { projectId: project.id, versionId: applied.versionId, kind: 'CREATIVE', decision: 'approve', userId });
  const approved = await approvalService.isApproved(prisma as never, { projectId: project.id, versionId: applied.versionId, kind: 'CREATIVE' });
  assert(approved, 'P:approval', 'new version not approved');
  ok('P:APPROVAL → new version approved');

  const derived = await outputService.derive(prisma as never, { projectId: project.id, versionId: applied.versionId, format: 'LANDSCAPE' });
  const output = await outputService.render(prisma as never, { projectId: project.id, outputId: derived.output.id });
  assert(output.status === 'READY' && Boolean(output.assetUrl), 'P:output', `output not READY: ${output.errorMessage ?? output.status}`);
  ok(`P:OUTPUT → LANDSCAPE READY (${output.assetUrl?.slice(0, 60)})`);
}

// ─── Journey X — context participates in production ──────────────────────────
async function journeyX(userId: string) {
  ok('JOURNEY X — CONTEXT PARTICIPATES IN PRODUCTION');
  const studio = await studioService.create(prisma as never, {
    userId,
    name: 'Voltaic Noir',
    brand: {
      brandIdentity: { name: 'Voltaic Noir', tagline: 'Night belongs to you' },
      tone: { style: 'noir, high-contrast' },
      approvedMessaging: ['Night belongs to you'],
      visualLanguage: { style: 'noir cinematic, deep shadows' },
    },
  });
  const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId, name: 'Voltaic Nectar', claims: { hero: 'restores at night' } });
  const campaign = await studioService.createCampaign(prisma as never, { studioId: studio.id, userId, name: 'Night Launch', productId: product.id, objective: 'launch the nectar', audience: 'young professionals' });
  const { projectId } = await studioService.createCampaignProject(prisma as never, { campaignId: campaign.id, userId, prompt: 'Create a 30-second cinematic launch for Voltaic Nectar.' });

  const built = await productionPlanService.plan(prisma as never, { projectId, userId });
  const context = built.plan.contextSnapshot;
  assert(context?.source === 'STUDIO', 'X:source', `expected STUDIO, got ${context?.source}`);
  assert(context?.brandName === 'Voltaic Noir', 'X:brand', `brandName=${context?.brandName}`);
  assert(context?.approvedMessaging?.includes('Night belongs to you'), 'X:messaging', 'approved messaging not inherited');
  ok(`X:context snapshot → source=${context?.source}, brand=${context?.brandName}, messaging=[${context?.approvedMessaging?.join('; ')}]`);

  const trimmed = await persistTrimmed(projectId, built.plan, 1);
  const bible = await prisma.creativeBible.findUnique({ where: { projectId } });
  const specs = routeProduction(trimmed, bible as never, trimmed.contextSnapshot);
  assert(specs.some((s) => s.prompt.includes('Voltaic Noir')), 'X:prompt', 'generation prompt does not include the inherited brand context');
  ok('X:generation prompt carries the inherited brand context');

  const captured: string[] = [];
  const deps = {
    generateStill: async (spec: any, p: string, a: string) => { captured.push(spec.prompt); return generateStill(spec, p, a); },
    generateVideo: async (spec: any, p: string, a: string, seed?: string) => { captured.push(spec.prompt); return generateVideo(spec, p, a, seed); },
    extractLastFrame: (url: string, prefix: string) => extractLastFrame(url, prefix),
  };
  await projectService.updateStatus(prisma as never, { projectId, userId, status: 'APPROVED' });
  const produced = await runCreativeProduction(prisma as never, { projectId }, deps as never);
  assert(produced.failed === 0, 'X:produce', `production had ${produced.failed} failure(s)`);
  assert(captured.some((p) => p.includes('Voltaic Noir')), 'X:real-prompt', 'real provider prompt did not include the inherited context');
  ok(`X:REAL PRODUCTION → prompt included "Voltaic Noir" (${produced.generated} assets generated)`);
}

// ─── Journey R — recovery after a process restart ────────────────────────────
async function journeyR(userId: string) {
  ok('JOURNEY R — RECOVERY (RUNNING → STALE → RECOVER → RESUME → READY)');
  const prompt = 'Create a 1-minute noir scene in a rain-soaked alley.';
  const interpretation = intentService.interpret(prompt);
  const project = await projectService.createFromIntent(prisma as never, { userId, text: prompt, interpretation });
  const built = await productionPlanService.plan(prisma as never, { projectId: project.id, userId });
  await persistTrimmed(project.id, built.plan, 1);
  await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });

  // Start production in a SEPARATE producer process, then kill it mid-run to
  // simulate the application process dying during a detached run.
  const child = spawn('pnpm', ['exec', 'tsx', 'scripts/phase9-live-smoke.ts', '--produce', project.id], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });

  // Wait until at least one asset is READY (completed work we must not redo).
  let readyCount = 0;
  for (let i = 0; i < 90; i += 1) {
    readyCount = await prisma.creativeProducedAsset.count({ where: { projectId: project.id, status: 'READY' } });
    if (readyCount >= 1) break;
    await sleep(2000);
  }
  assert(readyCount >= 1, 'R:producer-progress', 'producer did not complete any asset before timeout');

  const readyBefore = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id, status: 'READY' } });
  const runBefore = await prisma.creativeProductionRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } });
  assert(Boolean(runBefore) && runBefore!.status === 'RUNNING', 'R:running', `expected a RUNNING run, got ${runBefore?.status}`);
  ok(`R:RUNNING → producer completed ${readyBefore.length} asset(s) (run ${runBefore!.id})`);

  try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ }
  await sleep(3000);
  const staleRun = await prisma.creativeProductionRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } });
  assert(Boolean(staleRun) && staleRun!.status === 'RUNNING', 'R:stale', 'run should still be RUNNING (stale) after the producer died');
  ok('R:STALE → producer killed; run still RUNNING with a dead process');

  const recovered = await recoverStuckProductions(prisma as never, undefined, { staleMs: 2000, userId });
  assert(recovered.recovered.includes(project.id), 'R:recover', `project not recovered (active=${recovered.alreadyActive.join(',')})`);
  ok(`R:RECOVER → resumed (stale=${recovered.stale.length})`);

  const finalProject = await prisma.creativeProject.findUnique({ where: { id: project.id } });
  const runAfter = await prisma.creativeProductionRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } });
  assert(finalProject?.status === 'REVIEW', 'R:resume', `project did not reach REVIEW (${finalProject?.status})`);
  assert(runAfter?.status === 'COMPLETED' || runAfter?.status === 'PARTIAL', 'R:run-final', `run not finalized (${runAfter?.status})`);

  const readyAfter = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id, status: 'READY' } });
  for (const prior of readyBefore) {
    const current = readyAfter.find((a) => a.id === prior.id);
    assert(Boolean(current) && current!.assetUrl === prior.assetUrl, 'R:no-regen', `completed asset ${prior.id} was regenerated`);
  }
  ok(`R:RESUME → project REVIEW, run ${runAfter!.status}; ${readyBefore.length} completed asset(s) NOT regenerated`);
}

async function main() {
  const userId = await ensureIntegrationUser();
  const ONLY = process.argv.indexOf('--journey');
  const JOURNEYS = ONLY >= 0 ? [process.argv[ONLY + 1]] : ['P', 'X', 'R'];
  console.log(JSON.stringify({ status: 'RUN', journeys: JOURNEYS, userId }));
  for (const journey of JOURNEYS) {
    try {
      if (journey === 'P') await journeyP(userId);
      else if (journey === 'X') await journeyX(userId);
      else if (journey === 'R') await journeyR(userId);
      else throw new Error(`unknown journey ${journey}`);
    } catch (error) {
      fail(`journey-${journey}`, error);
    }
  }
  console.log(JSON.stringify({ status: FAILED.length ? 'FAILED' : 'COMPLETE', failed: FAILED }));
  await prisma.$disconnect();
  process.exit(FAILED.length ? 1 : 0);
}

// Child worker mode: run a production and stay alive until killed.
const PRODUCE = process.argv.indexOf('--produce');
if (PRODUCE >= 0) {
  const projectId = process.argv[PRODUCE + 1];
  runCreativeProduction(prisma as never, { projectId })
    .then((result) => console.log(JSON.stringify({ status: 'PRODUCE_DONE', projectId, ...result })))
    .catch((error) => console.log(JSON.stringify({ status: 'PRODUCE_ERROR', projectId, error: String(error) })))
    .finally(() => { void prisma.$disconnect(); });
} else {
  main().catch(async (error) => {
    console.log(JSON.stringify({ status: 'FATAL', error: error instanceof Error ? error.message : String(error) }));
    await prisma.$disconnect();
    process.exit(1);
  });
}
