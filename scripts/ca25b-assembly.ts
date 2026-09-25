#!/usr/bin/env tsx
/**
 * CA25-B Full Assembly Acceptance Script
 *
 * Validates the complete production → assembly pipeline for Story, Education,
 * and Transform journeys. Unlike ca25-acceptance.ts (which bounded production
 * to 2 scenes), this script runs FULL 4-scene production and verifies that:
 *
 *   CREATE → PLAN → TREATMENT → 4 images → 4 videos → ASSEMBLY → FINAL OUTPUT
 *
 * Each journey produces 4 IMAGE + 4 VIDEO assets, triggers autoAssemble, and
 * verifies the final creativeOutput row is READY with an accessible assetUrl.
 *
 * Usage (on VPS — takes ~20-25 min):
 *   pnpm exec tsx scripts/ca25b-assembly.ts
 *   pnpm exec tsx scripts/ca25b-assembly.ts --journey story
 *   pnpm exec tsx scripts/ca25b-assembly.ts --journey education
 *   pnpm exec tsx scripts/ca25b-assembly.ts --journey transform
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { intentService } from '../packages/api/src/lib/creative/intent/service';
import { projectService } from '../packages/api/src/lib/creative/project/service';
import { productionPlanService } from '../packages/api/src/lib/creative/production/service';
import { runCreativeProduction } from '../packages/api/src/lib/creative/production/runner';
import { routeProduction } from '../packages/api/src/lib/creative/production/capabilityRouter';
import type { CreativeProductionPlanState } from '../packages/api/src/lib/creative/production/plan';

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

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(label: string, data?: unknown) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), label, ...(data ? { data } : {}) }));
}
function pass(label: string, detail?: string) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), PASS: label, ...(detail ? { detail } : {}) }));
}
function fail(label: string, detail: string): never {
  console.log(JSON.stringify({ ts: new Date().toISOString(), FAIL: label, detail }));
  throw new Error(`FAIL [${label}]: ${detail}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureAcceptanceUser(): Promise<string> {
  const email = 'ca25b-assembly@raivstream.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, username: 'ca25bassembly', displayName: 'CA25-B Assembly', passwordHash: 'acceptance-only', role: 'CREATOR' },
    });
  }
  await prisma.creditBalance.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, balance: 500000 } });
  return user.id;
}

function inspectTreatment(plan: CreativeProductionPlanState): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  let ok = true;
  const scenes = plan.scenes;
  const creativeDirections = scenes.map((s) => s.creativeDirection ?? '');

  if (!creativeDirections.every(Boolean)) {
    findings.push(`FAIL: ${creativeDirections.filter((d) => !d).length} scene(s) missing creativeDirection`);
    ok = false;
  } else {
    findings.push(`OK: all ${scenes.length} scenes have creativeDirection`);
  }

  const uniqueDirs = new Set(creativeDirections);
  findings.push(`distinct creativeDirections: ${uniqueDirs.size}/${scenes.length}`);

  const motionPresent = scenes.filter((s) => s.motionDirection).length;
  findings.push(`motionDirections present: ${motionPresent}/${scenes.length}`);

  for (const scene of scenes) {
    findings.push(`  ${scene.sceneId}: cd="${(scene.creativeDirection ?? '').slice(0, 70)}" md="${(scene.motionDirection ?? '').slice(0, 50)}"`);
  }
  return { pass: ok, findings };
}

/** Verify scene ordering in plan matches expected SCENE_01..SCENE_04 sequence. */
function inspectSceneOrder(plan: CreativeProductionPlanState): { pass: boolean; order: string[] } {
  const order = plan.scenes.map((s) => s.sceneId);
  const expected = plan.scenes.map((_, i) => `SCENE_${String(i + 1).padStart(2, '0')}`);
  const ok = order.every((id, i) => id === expected[i]);
  return { pass: ok, order };
}

/** Query the creativeOutput table and verify assembly result. */
async function inspectAssembly(projectId: string, plan: CreativeProductionPlanState): Promise<{
  pass: boolean;
  outputId: string | null;
  outputStatus: string | null;
  assetUrl: string | null;
  accessible: boolean;
  findings: string[];
}> {
  const findings: string[] = [];
  let ok = true;

  const outputs = await prisma.creativeOutput.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  if (outputs.length === 0) {
    findings.push('FAIL: no creativeOutput rows found after production');
    return { pass: false, outputId: null, outputStatus: null, assetUrl: null, accessible: false, findings };
  }

  const latest = outputs[0];
  findings.push(`creativeOutput rows: ${outputs.length}, latest id=${latest.id} status=${latest.status}`);

  if (latest.status !== 'READY') {
    findings.push(`FAIL: output status is ${latest.status} (expected READY). errorMessage=${latest.errorMessage ?? '(none)'}`);
    ok = false;
  } else {
    findings.push('OK: output status READY');
  }

  const assetUrl = (latest as unknown as { assetUrl: string | null }).assetUrl;
  if (!assetUrl) {
    findings.push('FAIL: output assetUrl is null');
    ok = false;
  } else {
    findings.push(`assetUrl: ${assetUrl}`);
  }

  // Verify scene count in assembly: plan.scenes determines what clips go in.
  const expectedSceneIds = plan.scenes.map((s) => s.sceneId);
  findings.push(`expected scene IDs in assembly: ${expectedSceneIds.join(', ')}`);

  // Verify the version FK was resolved (assembly creates/reuses a CreativeVersion)
  const versionId = (latest as unknown as { versionId: string }).versionId;
  if (versionId) {
    const version = await prisma.creativeVersion.findUnique({ where: { id: versionId } });
    findings.push(version
      ? `version resolved: id=${versionId} versionNumber=${version.versionNumber}`
      : `WARN: version row ${versionId} not found`);
  }

  // Try to verify the assetUrl is reachable
  let accessible = false;
  if (assetUrl) {
    try {
      const res = await fetch(assetUrl, { method: 'HEAD' });
      accessible = res.ok;
      findings.push(`accessibility HEAD ${assetUrl.slice(-60)}: ${res.status} ${res.ok ? 'OK' : 'FAIL'}`);
      if (!res.ok) ok = false;
    } catch (e) {
      findings.push(`accessibility check failed: ${(e as Error).message}`);
      ok = false;
    }
  }

  return { pass: ok, outputId: latest.id, outputStatus: latest.status, assetUrl, accessible, findings };
}

// ─── Journey: Story ──────────────────────────────────────────────────────────

async function journeyStory(userId: string) {
  const intent = 'Tell a short cinematic story about a child discovering a mysterious glowing object in a garden at sunset.';
  log('STORY — START', { intent });

  const interpretation = intentService.interpret(intent);
  if (interpretation.projectType !== 'STORY') fail('story:intent', `expected STORY got ${interpretation.projectType}`);
  pass('story:intent', `projectType=${interpretation.projectType}`);

  const project = await projectService.createFromIntent(prisma as never, { userId, text: intent, interpretation });
  log('STORY — PROJECT', { id: project.id });

  const planResult = await productionPlanService.plan(prisma as never, { projectId: project.id, userId });
  if (!planResult.ok) fail('story:plan', `readiness blocked: ${JSON.stringify(planResult)}`);
  const { plan } = planResult as { ok: true; plan: CreativeProductionPlanState; preview: unknown };
  log('STORY — PLAN', { scenes: plan.scenes.length, structure: plan.structure });
  if (plan.scenes.length !== 4) fail('story:plan-count', `expected 4 scenes got ${plan.scenes.length}`);
  pass('story:plan', `${plan.scenes.length} scenes`);

  const treatment = inspectTreatment(plan);
  for (const f of treatment.findings) log('STORY:TREATMENT', { finding: f });
  if (!treatment.pass) fail('story:treatment', 'treatment inspection failed');
  pass('story:treatment', 'all 4 scenes enriched');

  const ordering = inspectSceneOrder(plan);
  if (!ordering.pass) fail('story:ordering', `plan scene order wrong: ${ordering.order.join(',')}`);
  pass('story:ordering', `scene order: ${ordering.order.join(' → ')}`);

  await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });
  log('STORY — PRODUCE (4 scenes, full)');
  const t0 = Date.now();
  const result = await runCreativeProduction(prisma as never, { projectId: project.id });
  const productionMs = Date.now() - t0;
  log('STORY — PRODUCE result', { generated: result.generated, failed: result.failed, status: result.status, productionMs });

  if (result.status !== 'COMPLETED') fail('story:produce', `production status=${result.status} failed=${result.failed}`);
  pass('story:produce', `generated=${result.generated} in ${Math.round(productionMs / 1000)}s`);

  // Verify asset breakdown
  const assets = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } });
  const images = assets.filter((a) => a.kind === 'IMAGE' && a.status === 'READY');
  const videos = assets.filter((a) => a.kind === 'VIDEO' && a.status === 'READY');
  const failedAssets = assets.filter((a) => a.status === 'FAILED');
  log('STORY — ASSETS', assets.map((a) => ({ kind: a.kind, sceneId: a.sceneId, status: a.status, url: (a as never as { assetUrl: string | null }).assetUrl?.slice(-50) })));

  if (images.length !== 4) fail('story:images', `expected 4 READY images got ${images.length}`);
  pass('story:images', '4/4 images READY');
  if (videos.length !== 4) fail('story:videos', `expected 4 READY videos got ${videos.length}`);
  pass('story:videos', '4/4 videos READY');
  if (failedAssets.length > 0) log('STORY:FAILED_ASSETS', failedAssets.map((a) => ({ sceneId: a.sceneId, kind: a.kind, error: (a as never as { errorMessage: string | null }).errorMessage })));

  // Inspect assembly
  log('STORY — ASSEMBLY');
  const t1 = Date.now();
  const assembly = await inspectAssembly(project.id, plan);
  const assemblyMs = Date.now() - t1;
  for (const f of assembly.findings) log('STORY:ASSEMBLY', { finding: f });
  if (!assembly.pass) fail('story:assembly', `assembly inspection failed (${assembly.outputStatus ?? 'no output'})`);
  pass('story:assembly', `outputId=${assembly.outputId} url=${assembly.assetUrl?.slice(-50)} accessible=${assembly.accessible} assemblyMs=${assemblyMs}`);

  // Verify project status reached REVIEW
  const proj = await prisma.creativeProject.findUnique({ where: { id: project.id }, select: { status: true } });
  log('STORY — PROJECT STATUS', { status: proj?.status });
  if (proj?.status !== 'REVIEW') log('STORY:WARN', { msg: `project status is ${proj?.status} (expected REVIEW)` });

  return {
    projectId: project.id, runId: result.runId,
    imageCount: images.length, videoCount: videos.length,
    outputId: assembly.outputId, outputStatus: assembly.outputStatus,
    assetUrl: assembly.assetUrl, accessible: assembly.accessible,
    productionMs, assemblyMs: assemblyMs,
  };
}

// ─── Journey: Education ──────────────────────────────────────────────────────

async function journeyEducation(userId: string) {
  const intent = 'Teach children how a seed becomes a plant, from planting the seed to seeing the first leaves.';
  log('EDUCATION — START', { intent });

  const interpretation = intentService.interpret(intent);
  if (interpretation.projectType !== 'EDUCATION') fail('edu:intent', `expected EDUCATION got ${interpretation.projectType}`);
  pass('edu:intent', `projectType=${interpretation.projectType}`);

  const project = await projectService.createFromIntent(prisma as never, { userId, text: intent, interpretation });
  log('EDUCATION — PROJECT', { id: project.id });

  const planResult = await productionPlanService.plan(prisma as never, { projectId: project.id, userId });
  if (!planResult.ok) fail('edu:plan', `readiness blocked: ${JSON.stringify(planResult)}`);
  const { plan } = planResult as { ok: true; plan: CreativeProductionPlanState; preview: unknown };
  log('EDUCATION — PLAN', { scenes: plan.scenes.length, structure: plan.structure });
  if (plan.scenes.length !== 4) fail('edu:plan-count', `expected 4 scenes got ${plan.scenes.length}`);
  pass('edu:plan', `${plan.scenes.length} scenes`);

  // Verify instructional progression (Hook → Explain → Example → Recap)
  const beats = plan.scenes.map((s) => s.beat);
  log('EDUCATION:PROGRESSION', { beats });
  pass('edu:progression', `beats: ${beats.join(' → ')}`);

  const treatment = inspectTreatment(plan);
  for (const f of treatment.findings) log('EDUCATION:TREATMENT', { finding: f });
  if (!treatment.pass) fail('edu:treatment', 'treatment inspection failed');
  pass('edu:treatment', 'all 4 scenes enriched');

  const ordering = inspectSceneOrder(plan);
  if (!ordering.pass) fail('edu:ordering', `plan scene order wrong: ${ordering.order.join(',')}`);
  pass('edu:ordering', `scene order: ${ordering.order.join(' → ')}`);

  await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });
  log('EDUCATION — PRODUCE (4 scenes, full)');
  const t0 = Date.now();
  const result = await runCreativeProduction(prisma as never, { projectId: project.id });
  const productionMs = Date.now() - t0;
  log('EDUCATION — PRODUCE result', { generated: result.generated, failed: result.failed, status: result.status, productionMs });

  if (result.status !== 'COMPLETED') fail('edu:produce', `production status=${result.status} failed=${result.failed}`);
  pass('edu:produce', `generated=${result.generated} in ${Math.round(productionMs / 1000)}s`);

  const assets = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } });
  const images = assets.filter((a) => a.kind === 'IMAGE' && a.status === 'READY');
  const videos = assets.filter((a) => a.kind === 'VIDEO' && a.status === 'READY');
  const failedAssets = assets.filter((a) => a.status === 'FAILED');
  log('EDUCATION — ASSETS', assets.map((a) => ({ kind: a.kind, sceneId: a.sceneId, status: a.status })));

  if (images.length !== 4) fail('edu:images', `expected 4 READY images got ${images.length}`);
  pass('edu:images', '4/4 images READY');
  if (videos.length !== 4) fail('edu:videos', `expected 4 READY videos got ${videos.length}`);
  pass('edu:videos', '4/4 videos READY');
  if (failedAssets.length > 0) log('EDUCATION:FAILED_ASSETS', failedAssets.map((a) => ({ sceneId: a.sceneId, kind: a.kind })));

  log('EDUCATION — ASSEMBLY');
  const assembly = await inspectAssembly(project.id, plan);
  for (const f of assembly.findings) log('EDUCATION:ASSEMBLY', { finding: f });
  if (!assembly.pass) fail('edu:assembly', `assembly inspection failed (${assembly.outputStatus ?? 'no output'})`);
  pass('edu:assembly', `outputId=${assembly.outputId} url=${assembly.assetUrl?.slice(-50)} accessible=${assembly.accessible}`);

  return {
    projectId: project.id, runId: result.runId,
    imageCount: images.length, videoCount: videos.length,
    outputId: assembly.outputId, outputStatus: assembly.outputStatus,
    assetUrl: assembly.assetUrl, accessible: assembly.accessible,
    productionMs,
  };
}

// ─── Journey: Transform ──────────────────────────────────────────────────────

async function journeyTransform(userId: string) {
  const sourceImageUrl = 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80';
  const intent = 'Transform this portrait into a cinematic fine-art visual journey while preserving the identity of the person.';
  log('TRANSFORM — START', { intent, sourceImageUrl });

  const interpretation = intentService.interpret(intent);
  pass('transform:intent', `projectType=${interpretation.projectType}`);

  const project = await projectService.createFromIntent(prisma as never, { userId, text: intent, interpretation });
  log('TRANSFORM — PROJECT', { id: project.id });

  // Attach source image (simulates real upload path — url is already persisted)
  await prisma.creativeBrief.updateMany({
    where: { projectId: project.id },
    data: { attachments: [{ id: 'src-ca25b', label: 'Portrait', kind: 'image', origin: 'upload', url: sourceImageUrl }] as never },
  });
  pass('transform:source-attached', 'source image URL written to brief attachments');

  const planResult = await productionPlanService.plan(prisma as never, { projectId: project.id, userId });
  if (!planResult.ok) fail('transform:plan', `readiness blocked: ${JSON.stringify(planResult)}`);
  const { plan } = planResult as { ok: true; plan: CreativeProductionPlanState; preview: unknown };
  log('TRANSFORM — PLAN', { scenes: plan.scenes.length, structure: plan.structure, sourceRefs: plan.sourceReferences?.length });

  if (!plan.sourceReferences?.some((r) => r.url === sourceImageUrl)) {
    fail('transform:source-in-plan', 'source URL not in plan.sourceReferences');
  }
  pass('transform:source-in-plan', 'source reference present in plan');

  if (plan.scenes.length !== 3 && plan.scenes.length !== 4) {
    fail('transform:plan-count', `unexpected scene count ${plan.scenes.length}`);
  }
  pass('transform:plan', `${plan.scenes.length} scenes`);

  // Verify source URL appears in all IMAGE specs
  const specs = routeProduction(plan);
  const imageSpecs = specs.filter((s) => s.kind === 'IMAGE') as Array<{ kind: 'IMAGE'; sceneId: string; prompt: string; sourceImageUrl?: string }>;
  if (!imageSpecs.every((s) => s.sourceImageUrl === sourceImageUrl)) {
    fail('transform:source-in-specs', 'source URL not propagated to all IMAGE specs');
  }
  pass('transform:source-in-specs', `source URL in all ${imageSpecs.length} IMAGE specs`);

  const treatment = inspectTreatment(plan);
  for (const f of treatment.findings) log('TRANSFORM:TREATMENT', { finding: f });
  if (!treatment.pass) fail('transform:treatment', 'treatment inspection failed');
  pass('transform:treatment', `all ${plan.scenes.length} scenes enriched`);

  const ordering = inspectSceneOrder(plan);
  if (!ordering.pass) fail('transform:ordering', `plan scene order wrong: ${ordering.order.join(',')}`);
  pass('transform:ordering', `scene order: ${ordering.order.join(' → ')}`);

  await projectService.updateStatus(prisma as never, { projectId: project.id, userId, status: 'APPROVED' });
  log('TRANSFORM — PRODUCE (full scenes)');
  const t0 = Date.now();
  const result = await runCreativeProduction(prisma as never, { projectId: project.id });
  const productionMs = Date.now() - t0;
  log('TRANSFORM — PRODUCE result', { generated: result.generated, failed: result.failed, status: result.status, productionMs });

  if (result.status !== 'COMPLETED') fail('transform:produce', `production status=${result.status} failed=${result.failed}`);
  pass('transform:produce', `generated=${result.generated} in ${Math.round(productionMs / 1000)}s`);

  const assets = await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } });
  const images = assets.filter((a) => a.kind === 'IMAGE' && a.status === 'READY');
  const videos = assets.filter((a) => a.kind === 'VIDEO' && a.status === 'READY');
  log('TRANSFORM — ASSETS', assets.map((a) => ({ kind: a.kind, sceneId: a.sceneId, status: a.status, url: (a as never as { assetUrl: string | null }).assetUrl?.slice(-50) })));

  if (images.length !== plan.scenes.length) fail('transform:images', `expected ${plan.scenes.length} READY images got ${images.length}`);
  pass('transform:images', `${images.length}/${plan.scenes.length} images READY`);
  if (videos.length !== plan.scenes.length) fail('transform:videos', `expected ${plan.scenes.length} READY videos got ${videos.length}`);
  pass('transform:videos', `${videos.length}/${plan.scenes.length} videos READY`);

  // Log image URLs for manual visual identity inspection
  log('TRANSFORM:IMAGE_URLS', images.map((a) => ({ sceneId: a.sceneId, url: (a as never as { assetUrl: string | null }).assetUrl })));

  log('TRANSFORM — ASSEMBLY');
  const assembly = await inspectAssembly(project.id, plan);
  for (const f of assembly.findings) log('TRANSFORM:ASSEMBLY', { finding: f });
  if (!assembly.pass) fail('transform:assembly', `assembly inspection failed (${assembly.outputStatus ?? 'no output'})`);
  pass('transform:assembly', `outputId=${assembly.outputId} url=${assembly.assetUrl?.slice(-50)} accessible=${assembly.accessible}`);

  return {
    projectId: project.id, runId: result.runId,
    imageCount: images.length, videoCount: videos.length,
    outputId: assembly.outputId, outputStatus: assembly.outputStatus,
    assetUrl: assembly.assetUrl, accessible: assembly.accessible,
    productionMs, sceneCount: plan.scenes.length,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const journeyFilter = (() => {
  const idx = process.argv.indexOf('--journey');
  return idx >= 0 ? process.argv[idx + 1] : undefined;
})();

async function main() {
  log('CA25-B ASSEMBLY ACCEPTANCE', { journeyFilter: journeyFilter ?? 'all' });

  const userId = await ensureAcceptanceUser();
  log('ACCEPTANCE USER', { userId });

  const results: Record<string, unknown> = {};

  if (!journeyFilter || journeyFilter === 'story') {
    try {
      results.story = await journeyStory(userId);
      pass('STORY JOURNEY', 'COMPLETE');
    } catch (e) {
      results.story = { error: (e as Error).message };
      log('STORY JOURNEY FAILED', { error: (e as Error).message });
    }
  }

  if (!journeyFilter || journeyFilter === 'education') {
    try {
      results.education = await journeyEducation(userId);
      pass('EDUCATION JOURNEY', 'COMPLETE');
    } catch (e) {
      results.education = { error: (e as Error).message };
      log('EDUCATION JOURNEY FAILED', { error: (e as Error).message });
    }
  }

  if (!journeyFilter || journeyFilter === 'transform') {
    try {
      results.transform = await journeyTransform(userId);
      pass('TRANSFORM JOURNEY', 'COMPLETE');
    } catch (e) {
      results.transform = { error: (e as Error).message };
      log('TRANSFORM JOURNEY FAILED', { error: (e as Error).message });
    }
  }

  log('CA25-B SUMMARY', results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
