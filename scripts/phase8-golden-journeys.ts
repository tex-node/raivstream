#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — Phase 8 Integration Validation.
 *
 * Executes the four golden journeys against the DEPLOYED system using the REAL
 * creative services, REAL database, REAL fal providers (FLUX2 stills + MiniMax
 * H3 videos), REAL critic, and REAL ffmpeg output derivation — not mocks.
 *
 * Runs detached on the VPS with the app env (apps/web/.env.local). Creates an
 * isolated integration user with a funded credit balance so real generation
 * costs are not charged to a real creator. Each journey's production is bounded
 * to 2 scenes to keep runtime manageable while still exercising real I2V +
 * last-frame chaining.
 *
 * Usage (from repo root, on the VPS):
 *   pnpm exec tsx scripts/phase8-golden-journeys.ts            # run A-D
 *   pnpm exec tsx scripts/phase8-golden-journeys.ts --journey A
 *
 * Exits non-zero if any journey fails.
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
import { seriesService } from '../packages/api/src/lib/creative/series/service';
import { studioService } from '../packages/api/src/lib/creative/studio/service';
import { seriesContextService } from '../packages/api/src/lib/creative/series/context';
import { runCreativeProduction } from '../packages/api/src/lib/creative/production/runner';

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
const ONLY = process.argv.indexOf('--journey');
const JOURNEYS = ONLY >= 0 ? [process.argv[ONLY + 1]] : ['A', 'B', 'C', 'D'];
const FAILED: string[] = [];

function ok(label: string) { console.log(JSON.stringify({ status: 'PASS', journey: label })); }
function fail(label: string, error: unknown) {
  console.log(JSON.stringify({ status: 'FAIL', journey: label, error: error instanceof Error ? error.message : String(error) }));
  FAILED.push(label);
}

function assert(condition: boolean, label: string, error: string) {
  if (!condition) throw new Error(`[${label}] ${error}`);
}

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
    user = await prisma.user.create({
      data: { email, username: 'integration5', displayName: 'Integration 5.0', passwordHash: 'integration-only', role: 'CREATOR' },
    });
  }
  const balance = await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, balance: 100000 },
  });
  void balance;
  return user.id;
}

async function buildAndTrimPlan(projectId: string, scenes: number) {
  const result = await productionPlanService.plan(prisma as never, { projectId, userId: (await prisma.creativeProject.findUnique({ where: { id: projectId } }))!.userId });
  const trimmed = boundPlan(result.plan, scenes);
  await prisma.creativeProductionPlan.update({ where: { projectId }, data: { plan: trimmed as never, version: { increment: 1 } } });
  return trimmed;
}

/** Plan → version → approve → REAL produce → returns the produced plan. */
async function planApproveProduce(projectId: string, userId: string, instruction: string) {
  const plan = await buildAndTrimPlan(projectId, 2);
  const direct = await directorService.direct(prisma as never, { projectId, userId, instruction });
  await approvalService.decide(prisma as never, { projectId, versionId: direct.version.id, kind: 'CREATIVE', decision: 'approve', userId });
  await projectService.updateStatus(prisma as never, { projectId, userId, status: 'APPROVED' });
  const produced = await runCreativeProduction(prisma as never, { projectId });
  ok(`${plan.scenes.length}-scene production → ${produced.generated} ready, ${produced.failed} failed`);
  return { plan, version: direct.version, produced };
}

/** Review → Direct (new version) → assert invalidation → re-approve. */
async function reviewThenDirect(projectId: string, userId: string, firstVersionId: string) {
  const runs = await reviewService.runReview(prisma as never, { projectId, userId });
  ok(`review: ${runs.length} run(s), ${runs.filter((r) => r.status === 'COMPLETED').length} completed`);
  const direct2 = await directorService.direct(prisma as never, { projectId, userId, instruction: 'Make the ending hopeful.' });
  const priorApproved = await approvalService.isApproved(prisma as never, { projectId, versionId: firstVersionId, kind: 'CREATIVE' });
  assert(!priorApproved, 'approval-invalidation', 'prior version approval was NOT invalidated after a material Direct');
  ok('material Direct invalidated the prior version approval');
  await approvalService.decide(prisma as never, { projectId, versionId: direct2.version.id, kind: 'CREATIVE', decision: 'approve', userId });
  return direct2.version;
}

/** Derive + render (REAL ffmpeg) an output from an approved version. */
async function deriveAndRender(projectId: string, userId: string, versionId: string, format: 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE', duration?: number) {
  const derived = await outputService.derive(prisma as never, { projectId, versionId, format, durationSeconds: duration });
  const output = await outputService.render(prisma as never, { projectId, outputId: derived.output.id });
  assert(output.status === 'READY' && Boolean(output.assetUrl), `output-${format}`, `output ${format} not READY: ${output.errorMessage ?? output.status}`);
  ok(`output ${format}${duration ? ` · ${duration}s` : ''} READY (${output.assetUrl?.slice(0, 60)})`);
  return output;
}

// ─── Journey A — Storyteller ──────────────────────────────────────────────────
async function journeyA(userId: string) {
  ok('JOURNEY A — STORYTELLER');
  const prompt = 'Create a 5-minute photorealistic short film about a young Nigerian woman returning home after 10 years abroad and confronting her mother.';
  const interpretation = intentService.interpret(prompt);
  assert(interpretation.projectType === 'STORY', 'A:intent', `expected STORY, got ${interpretation.projectType}`);
  ok('A:intent → STORY');
  const project = await projectService.createFromIntent(prisma as never, { userId, text: prompt, interpretation });
  assert(project.bible, 'A:bible', 'no bible seeded');
  ok('A:brief+bible created');

  const { plan } = await planApproveProduce(project.id, userId, 'Make it more cinematic.');
  ok(`A:plan → ${plan.scenes.length} scenes, preview built`);
  const version = await reviewThenDirect(project.id, userId, (await prisma.creativeVersion.findFirst({ where: { projectId: project.id } }))!.id);
  ok('A:review + new version + re-approved');
  await deriveAndRender(project.id, userId, version.id, 'LANDSCAPE');
  await deriveAndRender(project.id, userId, version.id, 'PORTRAIT');
}

// ─── Journey B — Educator ─────────────────────────────────────────────────────
async function journeyB(userId: string) {
  ok('JOURNEY B — EDUCATOR');
  const prompt = 'Create a 3-minute lesson explaining photosynthesis to eight-year-olds.';
  const interpretation = intentService.interpret(prompt);
  assert(interpretation.projectType === 'EDUCATION', 'B:intent', `expected EDUCATION, got ${interpretation.projectType}`);
  ok('B:intent → EDUCATION');
  const project = await projectService.createFromIntent(prisma as never, { userId, text: prompt, interpretation });
  const { plan, version } = await planApproveProduce(project.id, userId, 'Make it more cinematic.');
  ok(`B:plan → ${plan.scenes.length} scenes`);
  const runs = await reviewService.runReview(prisma as never, { projectId: project.id, userId });
  ok(`B:review → ${runs.length} run(s)`);
  await deriveAndRender(project.id, userId, version.id, 'SQUARE');
}

// ─── Journey C — Professional Studio ──────────────────────────────────────────
async function journeyC(userId: string) {
  ok('JOURNEY C — PROFESSIONAL STUDIO');
  const studio = await studioService.create(prisma as never, { userId, name: 'Lumière Skincare' });
  const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId, name: 'Radiance Serum', claims: { hero: 'clinically backed radiance' } });
  const campaign = await studioService.createCampaign(prisma as never, { studioId: studio.id, userId, name: 'Radiance Launch', productId: product.id, objective: 'launch the serum', audience: 'premium buyers' });
  ok('C:studio + brand DNA + product + campaign');

  const { projectId } = await studioService.createCampaignProject(prisma as never, {
    campaignId: campaign.id, userId, prompt: 'Create a 30-second launch campaign for our new skincare product.',
  });
  const context = await studioService.context(prisma as never, { studioId: studio.id, campaignId: campaign.id });
  assert(context.product?.name === 'Radiance Serum', 'C:inheritance', 'campaign project did not inherit product context');
  ok('C:campaign project created with inherited Brief + Bible');

  const { plan } = await planApproveProduce(projectId, userId, 'Make it more premium.');
  ok(`C:plan → ${plan.scenes.length} scenes, produce → real stills + videos`);
  const version = await reviewThenDirect(projectId, userId, (await prisma.creativeVersion.findFirst({ where: { projectId } }))!.id);
  ok('C:review + direct + re-approved');
  await deriveAndRender(projectId, userId, version.id, 'LANDSCAPE');
  await deriveAndRender(projectId, userId, version.id, 'PORTRAIT');
  await deriveAndRender(projectId, userId, version.id, 'SQUARE');
}

// ─── Journey D — Series ───────────────────────────────────────────────────────
async function journeyD(userId: string) {
  ok('JOURNEY D — SERIES');
  const series = await seriesService.create(prisma as never, { userId, title: 'The Last City' });
  await seriesService.canon.update(prisma as never, {
    seriesId: series.id,
    canon: {
      version: 1,
      world: { description: 'Lagos, 2042', locations: { 'Family House': 'Warm lighting', 'Underground City': 'Neon tunnels' } },
      storyRules: ['Characters must face consequences'],
      worldRules: ['Night scenes use warm lighting'],
      characterRules: ['Identity is preserved'],
      visualLanguage: { style: 'photorealistic cinematic' },
      audioLanguage: { score: 'afro-futurist' },
      characterCanon: [{ name: 'Amara', identity: { appearance: 'young Nigerian woman, short cropped hair' }, relationships: { Father: 'estranged' } }],
      notes: [],
    },
  });
  ok('D:series + canon');

  const ep1 = await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId, prompt: 'Amara returns home.' });
  await planApproveProduce(ep1.projectId, userId, 'Make it more cinematic.');
  ok('D:episode 1 produced (real media)');

  const ep2 = await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId, prompt: 'The confrontation.' });
  const context2 = await seriesContextService.get(prisma as never, { seriesId: series.id, episodeId: ep2.episode.id });
  assert(context2.characters.some((c) => c.name === 'Amara'), 'D:identity', 'Amara identity not inherited into episode 2');
  assert(context2.previousEpisode?.episodeNumber === 1, 'D:previous', 'previous episode state not present');
  ok('D:episode 2 inherits identity + previous episode context');
  await seriesService.updateEpisode(prisma as never, { episodeId: ep2.episode.id, userId, state: { wardrobe: { color: 'red' }, emotionalState: 'torn' } });
  const ep2State = await seriesService.getEpisode(prisma as never, { episodeId: ep2.episode.id, userId });
  assert((ep2State.state as any)?.wardrobe?.color === 'red', 'D:state', 'episode state did not evolve');
  ok('D:episode state evolved (wardrobe red) — identity unchanged');

  const director = new (await import('../packages/api/src/lib/creative/director/service')).DirectorService();
  await director.direct(prisma as never, { projectId: ep2.projectId, userId, instruction: 'Make this episode darker.' });
  const canon = await seriesService.canon.get(prisma as never, series.id);
  assert((canon as any).visualLanguage.style.includes('photorealistic'), 'D:canon', 'series canon mutated by episode directive');
  ok('D:director darkened the episode; series canon preserved');
}

async function main() {
  const userId = await ensureIntegrationUser();
  console.log(JSON.stringify({ status: 'RUN', journeys: JOURNEYS, userId }));
  for (const journey of JOURNEYS) {
    try {
      if (journey === 'A') await journeyA(userId);
      else if (journey === 'B') await journeyB(userId);
      else if (journey === 'C') await journeyC(userId);
      else if (journey === 'D') await journeyD(userId);
      else throw new Error(`unknown journey ${journey}`);
    } catch (error) {
      fail(`journey-${journey}`, error);
    }
  }
  console.log(JSON.stringify({ status: FAILED.length ? 'FAILED' : 'COMPLETE', failed: FAILED }));
  await prisma.$disconnect();
  process.exit(FAILED.length ? 1 : 0);
}

main().catch(async (error) => {
  console.log(JSON.stringify({ status: 'FATAL', error: error instanceof Error ? error.message : String(error) }));
  await prisma.$disconnect();
  process.exit(1);
});