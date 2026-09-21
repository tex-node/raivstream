#!/usr/bin/env tsx
/**
 * Phase 16.4 E2E: `story.generateSceneNarration` against an ISOLATED scratch
 * staging database + the staging R2 bucket.
 *
 * Flow under test (the exact production path):
 *   fixtures → appRouter.createCaller → story.generateSceneNarration
 *     (getOrCreateSequence → getOrCreateAudioPlan → NARRATION track → AudioCue
 *      anchored to the timeline → generateSpeechForCue: moderate → credit gate →
 *      ElevenLabs TTS → R2 mirror → AudioAsset row → cue link → ledger)
 *   → assertions → cleanup.
 *
 * Safety (mirrors the repo's staging-gate convention):
 *   - Requires STAGING_DATABASE_URL env (never falls back to .env values).
 *   - REFUSES unless current_database() is exactly `raivstream_phase164_narration`
 *     AND the DB holds zero story_projects (fresh scratch DB expectation).
 *   - R2 writes go to the staging bucket from cred/fal_env.txt only.
 *   - Cleanup (default) deletes the R2 object + every fixture row and re-verifies
 *     zero residue. Pass --keep to skip cleanup for inspection.
 *
 * Usage (from repo root, with the SSH tunnel up and scratch DB pushed):
 *   $env:STAGING_DATABASE_URL='postgresql://postgres@127.0.0.1:55494/raivstream_phase164_narration'
 *   pnpm phase16:narration:e2e [--keep]
 *
 * Cost: one short ElevenLabs synthesis + ~50 staging test credits (temporary rate
 * on the scratch DB, dropped with the fixtures).
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

config({ path: resolve(__dirname, '../../../apps/web/.env.local') });
config({ path: resolve(__dirname, '../../../.env') });

function loadCredFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`Missing credential file: ${path}`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadCredFile(resolve(__dirname, '../../../cred/fal_env.txt'));
process.env.ELEVENLABS_TTS_ENABLED = 'true';

const EXPECTED_DB = 'raivstream_phase164_narration';
const KEEP = process.argv.includes('--keep');
const FFPROBE_BIN = process.env.FFPROBE_BIN ?? 'ffprobe';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

// Dynamic imports AFTER env is configured.
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';

const run: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }> = (command, args) => {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectRun(new Error(`${command} timed out`)); }, 120_000);
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c).slice(-2000); });
    child.on('error', (err) => { clearTimeout(timer); rejectRun(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
};

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function main(): Promise<void> {
  console.log('\nPhase 16.4 E2E (generateSceneNarration)\n');

  const stagingUrl = process.env.STAGING_DATABASE_URL;
  if (!stagingUrl) {
    check('staging DB configured', false, 'STAGING_DATABASE_URL is not set — refusing to run');
    return finish(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: stagingUrl } } });

  // ── Safety gate: scratch staging DB only, and empty ───────────────────────
  const identity = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>('SELECT current_database()');
  const dbName = identity[0]?.current_database;
  if (dbName !== EXPECTED_DB) {
    check('staging DB identity', false, `connected to '${dbName}', expected '${EXPECTED_DB}' — refusing`);
    await prisma.$disconnect();
    return finish(1);
  }
  check('staging DB identity', true, `database=${dbName} (isolated scratch)`);
  const existingProjects = await prisma.storyProject.count();
  if (existingProjects !== 0) {
    check('scratch DB empty', false, `${existingProjects} story_projects present — refusing`);
    await prisma.$disconnect();
    return finish(1);
  }
  check('scratch DB empty', true, '0 story_projects');

  const s3 = r2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const created = { r2Key: null as string | null };
  const ids = {} as Record<string, string>;

  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        email: 'phase164-narration-qa@raivstream.test',
        username: 'phase164_narration_qa',
        displayName: 'Phase 16.4 Narration QA',
        passwordHash: 'test-only-unusable',
      },
    });
    ids.user = user.id;
    await prisma.creditBalance.create({ data: { userId: user.id, balance: 1000 } });
    await prisma.featureCreditRate.create({
      data: { featureKey: 'story:speech_generation', creditsPerUnit: 50, unitLabel: 'request', description: 'E2E staging smoke (temporary)', isActive: true },
    });
    const project = await prisma.storyProject.create({
      data: { userId: user.id, title: 'Phase 16.4 Narration E2E', originalIdea: 'A lantern keeper on a floating island', audienceMode: 'GENERAL' },
    });
    ids.project = project.id;
    const scene = await prisma.storySceneSeed.create({
      data: {
        projectId: project.id,
        orderIndex: 1,
        title: 'The Dying Light',
        description: 'Mira climbs the spiral stairs as the lighthouse flame flickers in the storm.',
      },
    });
    ids.scene = scene.id;
    check('fixtures created', true, 'user/project/scene + 1000cr balance + temp rate 50cr');

    // ── The exact production path, via tRPC caller ──────────────────────────
    const ctx: Context = {
      prisma,
      userId: user.id,
      isR16: false,
      user: {
        id: user.id, email: user.email, username: user.username, displayName: user.displayName,
        avatarUrl: user.avatarUrl, role: user.role, premiumTier: user.premiumTier, verified: user.verified,
        followerCount: 0, followingCount: 0, totalViews: 0, totalLikes: 0,
      },
    };
    const caller = appRouter.createCaller(ctx);
    const res = await caller.story.generateSceneNarration({ projectId: project.id, sceneId: scene.id });
    ids.cue = res.cue.id;
    ids.asset = res.asset.id;
    created.r2Key = res.asset.storageKey;
    check('procedure completed', true, `cue=${res.cue.id} linked=${res.cue.audioAssetId === res.asset.id}`);

    // ── Assertions ──────────────────────────────────────────────────────────
    const expectedNarration = 'The Dying Light. Mira climbs the spiral stairs as the lighthouse flame flickers in the storm.';
    check('scene-derived narration', res.narration === expectedNarration, res.narration);

    const cueRow = await prisma.audioCue.findUnique({
      where: { id: res.cue.id },
      include: { track: true, audioAsset: true },
    });
    const cueOk =
      cueRow?.track.type === 'NARRATION'
      && cueRow.text === expectedNarration
      && cueRow.audioAssetId === res.asset.id
      && cueRow.sequenceSceneId !== null;
    check('cue row correct', Boolean(cueOk), `track=${cueRow?.track.type} sequenceScene=${cueRow?.sequenceSceneId ? 'anchored' : 'null'} text-match=${cueRow?.text === expectedNarration}`);

    const assetRow = await prisma.audioAsset.findUnique({ where: { id: res.asset.id } });
    const assetOk =
      assetRow?.sourceKind === 'GENERATED_SPEECH'
      && assetRow?.mimeType === 'audio/mpeg'
      && (assetRow?.fileSizeBytes ?? 0) > 0
      && (assetRow?.storageKey ?? '').startsWith(`story-projects/${project.id}/audio/`);
    check('asset row correct', Boolean(assetOk), `sourceKind=${assetRow?.sourceKind} mime=${assetRow?.mimeType} bytes=${assetRow?.fileSizeBytes}`);

    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: res.asset.storageKey }));
    check('R2 object exists', true, `bucket=${bucket} key=${res.asset.storageKey.split('/').slice(-2).join('/')}`);

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: res.asset.storageKey }));
    const chunks: Buffer[] = [];
    for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const tmpPath = join(tmpdir(), `phase164-narration-${Date.now()}.mp3`);
    writeFileSync(tmpPath, bytes);
    try {
      const probe = await run(FFPROBE_BIN, ['-v', 'quiet', '-print_format', 'json', '-show_streams', tmpPath]);
      const parsed = JSON.parse(probe.stdout) as { streams?: Array<{ codec_type: string }> };
      const hasAudio = (parsed.streams ?? []).some((s) => s.codec_type === 'audio');
      check('R2 bytes are valid audio', hasAudio, `bytes=${bytes.length} streams=${(parsed.streams ?? []).map((s) => s.codec_type).join(',')}`);
    } catch (e) {
      check('R2 bytes are valid audio', false, e instanceof Error ? e.message : String(e));
    }

    const ledger = await prisma.creditTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    const usage = ledger.find((t) => t.type === 'USAGE' && t.featureKey === 'story:speech_generation' && t.amount === -50);
    const balance = await prisma.creditBalance.findUnique({ where: { userId: user.id } });
    check('ledger charged 50cr', Boolean(usage) && balance?.balance === 950, `balance=${balance?.balance} txns=${ledger.length}`);
  } catch (err) {
    check('e2e completed', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (KEEP) {
      console.log('\n--keep: fixtures left in place for inspection\n');
    } else {
      console.log('\nCleaning up…');
      try {
        if (created.r2Key) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: created.r2Key }));
          let gone = false;
          try {
            await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: created.r2Key }));
          } catch {
            gone = true;
          }
          check('R2 object removed', gone, gone ? 'HeadObject no longer resolves' : 'object still readable!');
        }
        if (ids.cue) await prisma.audioCue.deleteMany({ where: { id: ids.cue } });
        if (ids.asset) await prisma.audioAsset.deleteMany({ where: { id: ids.asset } });
        // Plan cascades tracks; sequence cascades sequence_scenes; project cascades scenes.
        const plan = await prisma.audioPerformancePlan.findFirst({ where: { projectId: ids.project }, select: { id: true } });
        if (plan) await prisma.audioPerformancePlan.deleteMany({ where: { id: plan.id } });
        const sequence = await prisma.storySequence.findFirst({ where: { projectId: ids.project }, select: { id: true } });
        if (sequence) await prisma.storySequence.deleteMany({ where: { id: sequence.id } });
        if (ids.scene) await prisma.storySceneSeed.deleteMany({ where: { id: ids.scene } });
        if (ids.project) await prisma.storyProject.deleteMany({ where: { id: ids.project } });
        if (ids.user) {
          await prisma.creditTransaction.deleteMany({ where: { userId: ids.user } });
          await prisma.creditBalance.deleteMany({ where: { userId: ids.user } });
          await prisma.analyticsEvent.deleteMany({ where: { userId: ids.user } }).catch(() => undefined);
          await prisma.featureCreditRate.deleteMany({ where: { featureKey: 'story:speech_generation' } });
          await prisma.user.deleteMany({ where: { id: ids.user } });
        }
        const residue = await prisma.storyProject.count()
          + await prisma.audioCue.count()
          + await prisma.audioTrack.count()
          + await prisma.audioPerformancePlan.count()
          + await prisma.audioAsset.count()
          + await prisma.storySequence.count()
          + await prisma.user.count()
          + await prisma.creditTransaction.count()
          + await prisma.featureCreditRate.count({ where: { featureKey: 'story:speech_generation' } });
        check('zero residue', residue === 0, `leftover rows=${residue}`);
      } catch (err) {
        check('cleanup', false, err instanceof Error ? err.message : String(err));
      }
    }
    await prisma.$disconnect();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed\n`);
  return finish(failed.length === 0 ? 0 : 1);
}

function finish(code: number): never {
  process.exit(code);
}

main().catch((err) => {
  console.error('\nE2E crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});