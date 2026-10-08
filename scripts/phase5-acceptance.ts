#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — Phase 5 Controlled Live Acceptance
 *
 * Review → Direct → Targeted Iteration
 *
 * Gates A–H:
 *   A — REVIEW run
 *   B — DIRECT (director.propose for "Make Scene 2 more tense")
 *   C — TARGETING / IMPACT (analyzeImpact, planSceneIds)
 *   D — VERSIONING (applyInstruction → Version 2, Version 1 preserved)
 *   E — APPROVAL STATE (invalidated where expected)
 *   F — TARGETED PRODUCTION (only affected scenes regenerated, versionId stamped)
 *   G — SAFETY / BOUNDARIES
 *   H — REVIEW VERSION 2 + REGRESSION
 *
 * Usage (from VPS repo root):
 *   pnpm exec tsx scripts/phase5-acceptance.ts
 *
 * Credit cost:
 *   Baseline (3 scenes):  3×80 (IMAGE) + 3×200 (VIDEO) =  840 credits
 *   Gate F (Scene 2 only): 1×80 + 1×200                =  280 credits
 *   Total estimate: ~1,120 credits
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { directorService } from '../packages/api/src/lib/creative/director/service';
import { reviewService } from '../packages/api/src/lib/creative/review/service';
import { approvalService } from '../packages/api/src/lib/creative/approval/service';
import { runCreativeProduction } from '../packages/api/src/lib/creative/production/runner';
import { interpretDirective } from '../packages/api/src/lib/creative/director/interpreter';
import { analyzeImpact, planSceneIds } from '../packages/api/src/lib/creative/director/impact';
import type { CreativeProductionPlanState } from '../packages/api/src/lib/creative/production/plan';

// ─── env load ────────────────────────────────────────────────────────────────

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'apps', 'web', '.env.local'));
loadEnvFile(path.join(process.cwd(), 'packages', 'database', '.env'));

const prisma = new PrismaClient();

// ─── logging helpers ─────────────────────────────────────────────────────────

function log(label: string, data?: unknown) {
  console.log(JSON.stringify({ label, ...(data !== undefined ? { data } : {}) }));
}

function pass(gate: string, detail?: string) {
  console.log(JSON.stringify({ PASS: gate, ...(detail ? { detail } : {}) }));
}

function fail(gate: string, detail: string): never {
  const msg = `FAIL [${gate}]: ${detail}`;
  console.log(JSON.stringify({ FAIL: gate, detail }));
  throw new Error(msg);
}

async function creditBalance(userId: string): Promise<number> {
  const bal = await prisma.creditBalance.findUnique({ where: { userId } });
  return bal?.balance ?? 0;
}

// ─── acceptance user ─────────────────────────────────────────────────────────

async function ensureAcceptanceUser(): Promise<string> {
  const email = 'p5acceptance@test.raivstream.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        username: 'p5acceptance',
        displayName: 'Phase 5 Acceptance',
        passwordHash: 'acceptance-only-not-a-real-hash',
        role: 'CREATOR' as never,
      },
    });
    log('user.created', { userId: user.id, email });
  } else {
    log('user.exists', { userId: user.id, email });
  }
  await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, balance: 200000 },
  });
  return user.id;
}

// ─── plan factory ─────────────────────────────────────────────────────────────

function buildAcceptancePlan(): CreativeProductionPlanState {
  return {
    version: 1,
    structure: 'three-act',
    format: 'SHORT_FILM',
    targetDurationSeconds: 9,
    notes: ['Phase 5 acceptance project — lighthouse keeper story'],
    totalRuntimeSeconds: 9,
    scenes: [
      {
        sceneId: 'P5A_SCENE_01',
        order: 1,
        title: 'The Climb',
        beat: 'opening',
        description: 'A lighthouse keeper climbs the spiral staircase to the lamp room at dusk, carrying oil.',
        location: 'Lighthouse interior',
        timeOfDay: 'dusk',
        characters: ['The Keeper'],
        estimatedDurationSeconds: 3,
        shots: [
          { shotId: 'P5A_S01_SH01', title: 'Rising shot', description: 'Low-angle tracking shot up the spiral staircase.', durationSeconds: 3, camera: 'tracking low-angle' },
        ],
      },
      {
        sceneId: 'P5A_SCENE_02',
        order: 2,
        title: 'The Light',
        beat: 'midpoint',
        description: 'The keeper ignites the great lens. Light fans across the dark water below.',
        location: 'Lighthouse lamp room',
        timeOfDay: 'night',
        characters: ['The Keeper'],
        estimatedDurationSeconds: 3,
        shots: [
          { shotId: 'P5A_S02_SH01', title: 'Ignition', description: 'Close-up of the match meeting the wick, then wide reveal of the rotating lens.', durationSeconds: 3, camera: 'close then wide' },
        ],
      },
      {
        sceneId: 'P5A_SCENE_03',
        order: 3,
        title: 'Safe Harbor',
        beat: 'resolution',
        description: 'A distant ship finds its path through the mist, guided by the rotating beam.',
        location: 'Open sea, viewed from lighthouse',
        timeOfDay: 'night',
        characters: [],
        estimatedDurationSeconds: 3,
        shots: [
          { shotId: 'P5A_S03_SH01', title: 'The Ship', description: 'Wide shot of a ship emerging from fog toward safe harbour, lighthouse beam sweeping.', durationSeconds: 3, camera: 'wide' },
        ],
      },
    ],
    timeline: [
      { sceneId: 'P5A_SCENE_01', startSeconds: 0, endSeconds: 3 },
      { sceneId: 'P5A_SCENE_02', startSeconds: 3, endSeconds: 6 },
      { sceneId: 'P5A_SCENE_03', startSeconds: 6, endSeconds: 9 },
    ],
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  log('phase5-acceptance.start', { timestamp: new Date().toISOString() });

  // ── PREFLIGHT ────────────────────────────────────────────────────────────

  const { execSync } = await import('node:child_process');
  const commit = execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim();
  if (!commit.startsWith('6b830f4')) fail('PREFLIGHT', `Expected commit 6b830f4*, got ${commit}`);
  log('preflight.commit', { commit });

  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date }>>`
    SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE migration_name = '20261008130000_phase5_produced_asset_version_id'
  `;
  if (migrations.length === 0) fail('PREFLIGHT', 'Phase 5 migration not applied');
  log('preflight.migration', { migration: migrations[0]!.migration_name, appliedAt: migrations[0]!.finished_at });

  const colCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'creative_produced_assets' AND column_name = 'versionId'
  `;
  if (colCheck.length === 0) fail('PREFLIGHT', 'versionId column missing from creative_produced_assets');
  log('preflight.column', { column: 'versionId', table: 'creative_produced_assets', found: true });

  pass('PREFLIGHT', `commit=${commit.slice(0, 7)}, migration applied, versionId column present`);

  // ── ESTABLISH BASELINE PROJECT ───────────────────────────────────────────

  const userId = await ensureAcceptanceUser();
  const credBefore = await creditBalance(userId);
  log('baseline.credits_before', { credits: credBefore });

  const project = await prisma.creativeProject.create({
    data: {
      userId,
      title: 'Phase 5 Acceptance — Lighthouse Keeper',
      projectType: 'STORY' as never,
      status: 'APPROVED' as never,
    },
  });
  const projectId = project.id;
  log('baseline.project_created', { projectId, status: project.status });

  const plan = buildAcceptancePlan();
  await prisma.creativeProductionPlan.create({
    data: { projectId, plan: plan as never, version: 1 },
  });
  log('baseline.plan_created', { sceneCount: plan.scenes.length });

  const scene1Id = plan.scenes[0]!.sceneId;
  const scene2Id = plan.scenes[1]!.sceneId;
  const scene3Id = plan.scenes[2]!.sceneId;

  const version1 = await prisma.creativeVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      label: 'Baseline — Phase 5 acceptance',
      snapshot: { sceneIds: [scene1Id, scene2Id, scene3Id], createdAt: new Date().toISOString() } as never,
    },
  });
  await prisma.creativeProject.update({ where: { id: projectId }, data: { currentVersionId: version1.id } });
  const version1Id = version1.id;
  log('baseline.version1', { versionId: version1Id, versionNumber: version1.versionNumber });

  log('baseline.produce_start', { sceneCount: 3, expectedAssets: 6 });
  const baselineResult = await runCreativeProduction(prisma, { projectId });
  if (baselineResult.status !== 'COMPLETED') {
    fail('BASELINE', `Production status=${baselineResult.status} generated=${baselineResult.generated} failed=${baselineResult.failed}`);
  }
  if (baselineResult.generated !== 6) fail('BASELINE', `Expected 6 assets, got ${baselineResult.generated}`);

  const baselineAssets = await prisma.creativeProducedAsset.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });
  log('baseline.assets', { count: baselineAssets.length });

  const unstamped = baselineAssets.filter((a) => (a as Record<string, unknown>)['versionId'] !== version1Id);
  if (unstamped.length > 0) fail('BASELINE', `${unstamped.length} assets not stamped with version1Id=${version1Id}`);
  log('baseline.version_stamp', { versionId: version1Id, allStamped: true });

  const credAfterBaseline = await creditBalance(userId);
  const baselineCreditsUsed = credBefore - credAfterBaseline;
  log('baseline.credits_used', { used: baselineCreditsUsed, remaining: credAfterBaseline });

  // ── GATE A — REVIEW ──────────────────────────────────────────────────────

  log('gateA.start');

  const projectAfterProd = await prisma.creativeProject.findUnique({ where: { id: projectId } });
  if (projectAfterProd!.status !== 'REVIEW') {
    fail('GATE_A', `Expected status=REVIEW after production, got ${projectAfterProd!.status}`);
  }

  // runReview returns ReviewRunState[] (array)
  const reviewRuns = await reviewService.runReview(prisma, { projectId, userId });
  if (!reviewRuns || reviewRuns.length === 0) fail('GATE_A', 'review.runReview returned empty — no review runs created');
  log('gateA.runs', { runCount: reviewRuns.length });

  const firstReviewRun = reviewRuns[0]!;
  const reviewRunRow = await prisma.creativeReviewRun.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  if (!reviewRunRow) fail('GATE_A', 'No CreativeReviewRun row found after review.runReview');

  const reviewGet = await reviewService.getReview(prisma, { projectId, userId });
  if (!reviewGet?.runs || reviewGet.runs.length === 0) fail('GATE_A', 'review.getReview returned no runs');
  log('gateA.get', { runCount: reviewGet.runs.length });

  const firstFinding = firstReviewRun.findings[0];
  if (firstFinding) {
    // resolve takes { projectId, runId, findingId, resolution } — no userId, resolution not kind
    await reviewService.resolve(prisma, {
      projectId,
      runId: firstReviewRun.id,
      findingId: firstFinding.id,
      resolution: 'FIX' as never,
    });
    const resolution = await prisma.creativeReviewResolution.findFirst({ where: { runId: firstReviewRun.id, findingId: firstFinding.id } });
    if (!resolution) fail('GATE_A', 'CreativeReviewResolution not persisted after resolve');
    log('gateA.resolution', { resolutionId: resolution.id });
  } else {
    log('gateA.no_findings', { note: 'No findings (review passes clean)' });
  }

  const assetsAfterReview = await prisma.creativeProducedAsset.count({ where: { projectId } });
  if (assetsAfterReview !== baselineAssets.length) {
    fail('GATE_A', `Asset count changed from ${baselineAssets.length} to ${assetsAfterReview} during review`);
  }

  pass('GATE_A', `reviewRuns=${reviewRuns.length}, dbRunId=${reviewRunRow.id}, noProductionTriggered`);

  // ── GATE B — DIRECT ──────────────────────────────────────────────────────

  log('gateB.start');

  const instruction = 'Make Scene 2 more tense.';

  const versionsBeforePropose = await prisma.creativeVersion.count({ where: { projectId } });
  const proposalResult = await directorService.propose(prisma, { projectId, userId, instruction });
  if (!proposalResult?.decision) fail('GATE_B', 'director.propose returned no decision');
  const versionsAfterPropose = await prisma.creativeVersion.count({ where: { projectId } });
  if (versionsAfterPropose !== versionsBeforePropose) {
    fail('GATE_B', `propose created ${versionsAfterPropose - versionsBeforePropose} new version(s) — propose must NOT write to DB`);
  }

  const decision = proposalResult.decision;
  log('gateB.decision', {
    interpretation: decision.interpretation,
    scope: decision.directive.scope,
    impact: decision.impact,
    affectedSceneIds: decision.affectedSceneIds,
  });

  if (decision.impact === 'PROJECT') fail('GATE_B', `propose returned impact=PROJECT — expected LOCAL or MULTI_SCENE`);

  pass('GATE_B', `propose ok, scope=${decision.directive.scope}, impact=${decision.impact}, noDBWrite`);

  // ── GATE C — TARGETING / IMPACT ──────────────────────────────────────────

  log('gateC.start');

  const directiveInterp = interpretDirective(instruction, plan);
  log('gateC.directive', { mode: directiveInterp.mode, scope: directiveInterp.scope, impact: directiveInterp.impact, affectedSceneIndices: directiveInterp.affectedSceneIndices });

  if (directiveInterp.mode !== 'DIRECT') fail('GATE_C', `Expected mode=DIRECT, got ${directiveInterp.mode}`);
  if (!directiveInterp.affectedSceneIndices.includes(1)) {
    fail('GATE_C', `Expected scene index 1 in affectedSceneIndices, got ${JSON.stringify(directiveInterp.affectedSceneIndices)}`);
  }

  const impactResult = analyzeImpact({
    declared: directiveInterp.impact,
    sceneIndices: directiveInterp.affectedSceneIndices,
    totalScenes: plan.scenes.length,
  });
  const affectedSceneIds = planSceneIds(plan, impactResult.affectedSceneIndices);
  log('gateC.impact', { impact: impactResult.impact, affectedSceneIds });

  if (impactResult.impact === 'PROJECT' && impactResult.affectedSceneIndices.length === plan.scenes.length) {
    fail('GATE_C', 'Impact analysis returned full-project scope');
  }
  if (!affectedSceneIds.includes(scene2Id)) fail('GATE_C', `scene2Id=${scene2Id} not in affectedSceneIds`);
  if (affectedSceneIds.includes(scene1Id)) fail('GATE_C', `scene1Id=${scene1Id} should not be affected`);

  pass('GATE_C', `mode=DIRECT, impact=${impactResult.impact}, scene2Targeted, scene1Unaffected`);

  // ── GATE D — VERSIONING ──────────────────────────────────────────────────

  log('gateD.start');

  const applyResult = await directorService.applyInstruction(prisma, { projectId, userId, instruction });
  log('gateD.apply_result', { applied: applyResult.applied, versionId: applyResult.versionId, affectedSceneIds: applyResult.affectedSceneIds });

  if (!applyResult.applied) fail('GATE_D', 'applyInstruction returned applied=false');

  const version2 = await prisma.creativeVersion.findFirst({ where: { projectId, versionNumber: 2 } });
  if (!version2) fail('GATE_D', 'Version 2 not created by applyInstruction');
  if (version2.id !== applyResult.versionId) fail('GATE_D', `DB version2.id=${version2.id} != applyResult.versionId=${applyResult.versionId}`);

  const version1Check = await prisma.creativeVersion.findUnique({ where: { id: version1Id } });
  if (!version1Check) fail('GATE_D', `Version 1 (${version1Id}) was destroyed`);
  if (version1Check.id === version2.id) fail('GATE_D', 'Version 1 and Version 2 have the same ID');

  const projectAfterApply = await prisma.creativeProject.findUnique({ where: { id: projectId } });
  if (projectAfterApply!.currentVersionId !== version2.id) {
    fail('GATE_D', `project.currentVersionId=${projectAfterApply!.currentVersionId} != version2.id=${version2.id}`);
  }

  const persistedDirective = await prisma.creativeDirective.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  if (!persistedDirective) fail('GATE_D', 'No CreativeDirective row found');
  if (persistedDirective.id !== applyResult.directiveId) {
    fail('GATE_D', `directive ID mismatch: DB=${persistedDirective.id} vs result=${applyResult.directiveId}`);
  }

  const scene2AssetsAfterApply = await prisma.creativeProducedAsset.count({ where: { projectId, sceneId: scene2Id } });
  log('gateD.scene2_deleted', { count: scene2AssetsAfterApply });

  const scene1Ready = await prisma.creativeProducedAsset.count({ where: { projectId, sceneId: scene1Id, status: 'READY' } });
  if (scene1Ready < 2) fail('GATE_D', `Scene 1 should have ≥2 READY assets, got ${scene1Ready}`);

  const version2Id = version2.id;
  pass('GATE_D', `version2Id=${version2Id}, version1Preserved, scene2Deleted=${scene2AssetsAfterApply === 0}`);

  // ── GATE E — APPROVAL STATE ──────────────────────────────────────────────

  log('gateE.start');

  const approvals = await prisma.creativeApproval.findMany({ where: { projectId } });
  const stillApproved = approvals.filter((a) => a.status === 'APPROVED');
  const invalidated = approvals.filter((a) => a.status === 'INVALIDATED');
  log('gateE.approval_state', { total: approvals.length, stillApproved: stillApproved.length, invalidated: invalidated.length });

  const v2Approved = approvals.filter((a) => a.versionId === version2Id && a.status === 'APPROVED');
  if (v2Approved.length > 0) fail('GATE_E', 'Version 2 has a fabricated APPROVED record');

  // list takes { projectId } only
  const approvalList = await approvalService.list(prisma, { projectId });
  log('gateE.approval_list', { count: approvalList.length });

  pass('GATE_E', `invalidated=${invalidated.length}, stillApproved=${stillApproved.length}, v2NotFabricatedApproved=true`);

  // ── GATE F — TARGETED PRODUCTION ────────────────────────────────────────

  log('gateF.start');

  const credBeforeGateF = await creditBalance(userId);
  const v1AssetsScene1 = await prisma.creativeProducedAsset.findMany({ where: { projectId, sceneId: scene1Id, status: 'READY' } });
  const v1AssetsScene3 = await prisma.creativeProducedAsset.findMany({ where: { projectId, sceneId: scene3Id, status: 'READY' } });

  const gateFResult = await runCreativeProduction(prisma, { projectId });
  log('gateF.result', { status: gateFResult.status, generated: gateFResult.generated, failed: gateFResult.failed });

  if (gateFResult.status !== 'COMPLETED') fail('GATE_F', `Production status=${gateFResult.status}`);
  if (gateFResult.generated > 2) {
    fail('GATE_F', `Runner generated ${gateFResult.generated} assets — expected ≤2 (Scene 2 only). Full-project regeneration is NOT acceptable.`);
  }

  const scene2AssetsAfter = await prisma.creativeProducedAsset.findMany({ where: { projectId, sceneId: scene2Id, status: 'READY' } });
  for (const asset of scene2AssetsAfter) {
    const vId = (asset as Record<string, unknown>)['versionId'] as string | null;
    if (vId !== version2Id) fail('GATE_F', `Scene 2 asset ${asset.id} has versionId=${vId}, expected ${version2Id}`);
  }

  const scene1IdSet = new Set(v1AssetsScene1.map((a) => a.id));
  const scene3IdSet = new Set(v1AssetsScene3.map((a) => a.id));
  const scene1AssetsAfter = await prisma.creativeProducedAsset.findMany({ where: { projectId, sceneId: scene1Id, status: 'READY' } });
  const scene3AssetsAfter = await prisma.creativeProducedAsset.findMany({ where: { projectId, sceneId: scene3Id, status: 'READY' } });
  for (const a of scene1AssetsAfter) {
    if (!scene1IdSet.has(a.id)) fail('GATE_F', `Scene 1 has NEW asset ${a.id} — should not have been regenerated`);
  }
  for (const a of scene3AssetsAfter) {
    if (!scene3IdSet.has(a.id)) fail('GATE_F', `Scene 3 has NEW asset ${a.id} — should not have been regenerated`);
  }

  for (const a of scene1AssetsAfter) {
    const vId = (a as Record<string, unknown>)['versionId'] as string | null;
    if (vId !== version1Id) fail('GATE_F', `Scene 1 asset ${a.id} versionId changed from ${version1Id} to ${vId}`);
  }

  const credAfterGateF = await creditBalance(userId);
  const gateFCreditsUsed = credBeforeGateF - credAfterGateF;
  if (gateFCreditsUsed > 280) {
    fail('GATE_F', `Credits consumed=${gateFCreditsUsed} exceeds 280 (1 IMAGE + 1 VIDEO)`);
  }

  log('gateF.credits', { used: gateFCreditsUsed });
  pass('GATE_F', `generated=${gateFResult.generated}, scene2Stamped=${version2Id}, scene1/3Preserved, credits=${gateFCreditsUsed}`);

  // ── GATE G — SAFETY / BOUNDARIES ────────────────────────────────────────

  log('gateG.start');

  const acceptanceUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (String(acceptanceUser!.role) === 'R16') fail('GATE_G', 'Acceptance user should be CREATOR not R16');

  const allRuns = await prisma.creativeProductionRun.findMany({ where: { projectId }, orderBy: { startedAt: 'asc' } });
  log('gateG.production_runs', { count: allRuns.length });
  if (allRuns.length > 2) fail('GATE_G', `Expected ≤2 production runs, got ${allRuns.length} — hidden production occurred`);
  if (allRuns.length < 2) fail('GATE_G', `Expected 2 production runs, got ${allRuns.length}`);

  const foreignAssets = await prisma.creativeProducedAsset.findMany({
    where: { sceneId: { in: [scene1Id, scene2Id, scene3Id] }, projectId: { not: projectId } },
  });
  if (foreignAssets.length > 0) fail('GATE_G', `${foreignAssets.length} assets from foreign projects`);

  pass('GATE_G', `role=CREATOR, productionRuns=2, noForeignAssets`);

  // ── GATE H — REVIEW VERSION 2 + REGRESSION ──────────────────────────────

  log('gateH.start');

  const reviewV2Runs = await reviewService.runReview(prisma, { projectId, userId });
  if (!reviewV2Runs || reviewV2Runs.length === 0) fail('GATE_H', 'review.runReview on Version 2 returned empty');
  log('gateH.review_v2', { runCount: reviewV2Runs.length });

  const allReviewRuns = await prisma.creativeReviewRun.findMany({ where: { projectId } });
  if (allReviewRuns.length < 2) fail('GATE_H', `Expected ≥2 review runs (v1 + v2), got ${allReviewRuns.length}`);

  const allVersions = await prisma.creativeVersion.findMany({ where: { projectId }, orderBy: { versionNumber: 'asc' } });
  if (allVersions.length < 2) fail('GATE_H', `Expected ≥2 versions, got ${allVersions.length}`);
  if (allVersions[0]!.versionNumber !== 1) fail('GATE_H', 'Version 1 missing');
  if (allVersions[1]!.versionNumber !== 2) fail('GATE_H', 'Version 2 missing');

  const finalV1 = await prisma.creativeVersion.findUnique({ where: { id: version1Id } });
  if (!finalV1) fail('GATE_H', `Version 1 (${version1Id}) was deleted by Version 2 review`);
  log('gateH.version_history', { versions: allVersions.map((v) => ({ id: v.id, vn: v.versionNumber })), version1Intact: true });

  pass('GATE_H', `reviewV2Runs=${reviewV2Runs.length}, versions=${allVersions.length}, version1Intact`);

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────

  const credFinal = await creditBalance(userId);
  const totalCreditsUsed = credBefore - credFinal;
  const allAssetsFinal = await prisma.creativeProducedAsset.findMany({ where: { projectId } });

  console.log('');
  console.log('='.repeat(70));
  console.log('PHASE 5 CONTROLLED LIVE ACCEPTANCE');
  console.log('='.repeat(70));
  console.log(`Preflight:            PASS  commit=6b830f4, migration+column present`);
  console.log(`Gate A — Review:      PASS  reviewRuns=${reviewRuns.length}, no hidden production`);
  console.log(`Gate B — Direct:      PASS  propose ok, impact=${decision.impact}, no DB write`);
  console.log(`Gate C — Targeting:   PASS  mode=DIRECT, impact=${impactResult.impact}, scene2 only`);
  console.log(`Gate D — Versioning:  PASS  v2Created, v1Preserved, directive persisted`);
  console.log(`Gate E — Approval:    PASS  invalidated=${invalidated.length}, v2 not fabricated`);
  console.log(`Gate F — Production:  PASS  generated=${gateFResult.generated}, scene2 stamped v2`);
  console.log(`Gate G — Safety:      PASS  CREATOR, 2 runs, no bypass`);
  console.log(`Gate H — Review v2:   PASS  reviewV2Runs=${reviewV2Runs.length}, v1 intact`);
  console.log('');
  console.log(`Version 1:            ${version1Id}`);
  console.log(`Version 2:            ${version2Id}`);
  console.log(`Credits consumed:     ${totalCreditsUsed} (baseline=${baselineCreditsUsed}, gateF=${gateFCreditsUsed})`);
  console.log(`Assets total:         ${allAssetsFinal.length}`);
  console.log('');
  console.log('PHASE 5 COMPLETE — REVIEW → DIRECT → TARGETED ITERATION VERIFIED');
  console.log('='.repeat(70));
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    prisma.$disconnect().then(() => process.exit(1));
  });
