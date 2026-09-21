#!/usr/bin/env tsx
/**
 * Staged fal generation-flow E2E: credits → submit → poll → publish.
 *
 * Exercises the EXACT production tRPC path for the three live-proven fal
 * contracts (FLUX2 image, H3_MAX video, VEED_FABRIC talking-video):
 *   fixtures → appRouter.createCaller → generation.create
 *     (moderate → credit gate → submitGenerationJob → fal queue)
 *   → generation.pollStatus loop (→ R2-mirrored outputUrl)
 *   → R2 HeadObject → generation.publish → Video row
 *   → ledger assertions → cleanup.
 *
 * Chaining: the H3_MAX seed image is the FLUX2 R2 output from this run, and
 * the VEED presenter image reuses it too — proving the story-to-video
 * pipeline shape (image → animate → lip-sync) end to end.
 *
 * Safety (mirrors the repo's staging-gate convention):
 *   - Requires STAGING_DATABASE_URL env (never falls back to .env values).
 *   - REFUSES unless current_database() is exactly `raivstream_fal_gen_e2e`
 *     AND the DB holds zero generation_jobs (fresh scratch DB expectation).
 *   - FAL gates + R2 writes come from cred/fal_env.txt only (staging bucket).
 *   - Cleanup (default) deletes the R2 objects + every fixture row and
 *     re-verifies zero residue. Pass --keep to skip cleanup for inspection.
 *
 * Usage (from repo root, with the SSH tunnel up and scratch DB pushed):
 *   $env:STAGING_DATABASE_URL='postgresql://postgres@127.0.0.1:55492/raivstream_fal_gen_e2e'
 *   pnpm fal:e2e [--keep] [--models=flux2,h3max,veed] [--audioUrl=https://.../veed-smoke.mp3]
 *
 * --audioUrl: talking-track for the VEED leg. Defaults to VEED_AUDIO_URL env.
 *   A veed-smoke-*.mp3 fixture was left in staging R2 from contract validation.
 * --models: subset to run (default all three). h3max/veed reuse the flux2
 *   output of THIS run when included; running h3max/veed alone requires
 *   --seedImageUrl=https://... (a public staging R2 image URL).
 *
 * Cost: one live generation per model (~80 + ~200 + ~300 staging test
 * credits on the scratch DB, dropped with the fixtures) + real fal usage.
 * A 30s courtesy pause separates provider submissions (fal rate-limits
 * back-to-back calls with transient 403s).
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

// ─── Enable the fal gates for this explicit smoke test ───────────────────────
process.env.FAL_MEDIA_PROVIDER_ENABLED = 'true';
process.env.FAL_REAL_PROVIDER_CALLS_ENABLED = 'true';
process.env.FAL_IMAGE_ENABLED = 'true';
process.env.FAL_VIDEO_ENABLED = 'true';
process.env.FAL_UGC_ENABLED = 'true';
process.env.FAL_MAX_REQUESTS = process.env.FAL_MAX_REQUESTS ?? '10';
process.env.FAL_USE_PRODUCTION_STORAGE = 'false';

const EXPECTED_DB = 'raivstream_fal_gen_e2e';
const KEEP = process.argv.includes('--keep');
const MODELS_ARG = process.argv.find((a) => a.startsWith('--models='))?.slice('--models='.length).split(',').map((s) => s.trim().toLowerCase());
const AUDIO_URL_ARG = process.argv.find((a) => a.startsWith('--audioUrl='))?.slice('--audioUrl='.length);
const SEED_ARG = process.argv.find((a) => a.startsWith('--seedImageUrl='))?.slice('--seedImageUrl='.length);

const RUN_FLUX2 = !MODELS_ARG || MODELS_ARG.includes('flux2');
const RUN_H3MAX = !MODELS_ARG || MODELS_ARG.includes('h3max');
const RUN_VEED = !MODELS_ARG || MODELS_ARG.includes('veed');

const AUDIO_URL = AUDIO_URL_ARG ?? process.env.VEED_AUDIO_URL;
const RATE_PAUSE_MS = 30_000;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Dynamic imports AFTER env is configured.
import { PrismaClient } from '@raivstream/database';
import { appRouter, type Context } from '../src/index';

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

const KIND_DIR: Record<string, { dir: string; ext: string }> = {
  FLUX2: { dir: 'flux2', ext: 'png' },
  H3_MAX: { dir: 'h3max', ext: 'mp4' },
  VEED_FABRIC: { dir: 'veed', ext: 'mp4' },
};

function r2KeyFor(model: string, providerJobId: string): string {
  const requestId = providerJobId.replace(/^fal:/, '');
  const { dir, ext } = KIND_DIR[model];
  return `generated/fal/${dir}/${requestId}.${ext}`;
}

async function main(): Promise<void> {
  console.log('\nStaged fal generation-flow E2E (credits → submit → poll → publish)\n');

  if (!RUN_FLUX2 && !RUN_H3MAX && !RUN_VEED) {
    check('models selected', false, '--models matched nothing (flux2,h3max,veed)');
    return finish(1);
  }
  if (RUN_VEED && !AUDIO_URL) {
    check('veed audio configured', false, 'pass --audioUrl= or set VEED_AUDIO_URL (staging R2 veed-smoke-*.mp3 fixture)');
    return finish(1);
  }
  if ((RUN_H3MAX || RUN_VEED) && !RUN_FLUX2 && !SEED_ARG) {
    check('seed image configured', false, 'h3max/veed without flux2 need --seedImageUrl=https://… (public staging R2 image)');
    return finish(1);
  }

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
  const existingJobs = await prisma.generationJob.count();
  if (existingJobs !== 0) {
    check('scratch DB empty', false, `${existingJobs} generation_jobs present — refusing`);
    await prisma.$disconnect();
    return finish(1);
  }
  check('scratch DB empty', true, '0 generation_jobs');

  const s3 = r2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicBase = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  const createdKeys: string[] = [];
  const ids = {} as Record<string, string>;
  const videoIds: string[] = [];
  const jobIds: string[] = [];
  let seedImageUrl = SEED_ARG ?? '';
  let spent = 0;

  async function pollToCompletion(
    caller: ReturnType<typeof appRouter.createCaller>,
    jobId: string,
    timeoutMs: number,
    label: string,
  ): Promise<{ status: string; outputUrl: string | null; providerJobId: string | null }> {
    const started = Date.now();
    for (;;) {
      const job = await caller.generation.pollStatus({ jobId });
      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        return { status: job.status, outputUrl: job.outputUrl, providerJobId: job.providerJobId };
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`${label} still ${job.status} after ${Math.round(timeoutMs / 1000)}s (job=${jobId})`);
      }
      await sleep(5_000);
    }
  }

  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        email: 'fal-gen-qa@raivstream.test',
        username: 'fal_gen_qa',
        displayName: 'Fal Generation QA',
        passwordHash: 'test-only-unusable',
      },
    });
    ids.user = user.id;
    await prisma.creditBalance.create({ data: { userId: user.id, balance: 5000 } });
    const rates = [
      { featureKey: 'generate:flux2', creditsPerUnit: 80, unitLabel: 'request', description: 'E2E staging smoke (temporary)', isActive: true },
      { featureKey: 'generate:h3_max', creditsPerUnit: 200, unitLabel: 'request', description: 'E2E staging smoke (temporary)', isActive: true },
      { featureKey: 'generate:veed_fabric', creditsPerUnit: 300, unitLabel: 'request', description: 'E2E staging smoke (temporary)', isActive: true },
    ];
    for (const r of rates) await prisma.featureCreditRate.create({ data: r });
    check('fixtures created', true, 'user + 5000cr balance + temp rates 80/200/300');

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
    let firstLeg = true;

    async function runLeg(options: {
      model: 'FLUX2' | 'H3_MAX' | 'VEED_FABRIC';
      title: string;
      createInput: Record<string, unknown>;
      timeoutMs: number;
      cost: number;
    }): Promise<string> {
      if (!firstLeg) {
        console.log(`\n  …courtesy pause ${RATE_PAUSE_MS / 1000}s (fal rate-limits back-to-back calls)…`);
        await sleep(RATE_PAUSE_MS);
      }
      firstLeg = false;
      const created = await caller.generation.create(options.createInput as never);
      jobIds.push(created.id);
      check(`${options.model} submitted`, Boolean(created.providerJobId?.startsWith('fal:')), `job=${created.id} provider=${created.providerJobId}`);
      const final = await pollToCompletion(caller, created.id, options.timeoutMs, options.model);
      check(`${options.model} completed`, final.status === 'COMPLETED', `status=${final.status}`);
      const outputUrl = final.outputUrl ?? '';
      const mirrored = publicBase ? outputUrl.startsWith(publicBase) : outputUrl.includes('generated/fal/');
      check(`${options.model} R2-mirrored`, mirrored, outputUrl.slice(0, 120));
      const key = r2KeyFor(options.model, final.providerJobId ?? '');
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      createdKeys.push(key);
      check(`${options.model} R2 object exists`, true, `key=${key}`);
      const published = await caller.generation.publish({
        jobId: created.id,
        title: options.title,
        description: 'Staged generation-flow E2E smoke (temporary, unlisted)',
        isPublic: false,
      });
      videoIds.push(published.id);
      check(`${options.model} published`, Boolean(published.id), `video=${published.id}`);
      spent += options.cost;
      return outputUrl;
    }

    // ── Leg 1: FLUX2 image (also mints the seed image for legs 2–3) ─────────
    if (RUN_FLUX2) {
      seedImageUrl = await runLeg({
        model: 'FLUX2',
        title: 'E2E smoke — flux2 still',
        createInput: {
          model: 'FLUX2',
          prompt: 'A lighthouse on a basalt cliff at sunset, seabirds, painterly light, vertical composition',
          aspectRatio: '9:16',
        },
        timeoutMs: 180_000,
        cost: 80,
      });
    }

    // ── Leg 2: H3_MAX image-to-video from the flux2 still ───────────────────
    if (RUN_H3MAX) {
      await runLeg({
        model: 'H3_MAX',
        title: 'E2E smoke — h3max motion',
        createInput: {
          model: 'H3_MAX',
          prompt: 'Slow cinematic push-in, waves moving, clouds drifting, birds in flight',
          seedImageUrl,
          duration: 6,
        },
        timeoutMs: 240_000,
        cost: 200,
      });
    }

    // ── Leg 3: VEED talking-video (flux2 still + staging audio fixture) ─────
    if (RUN_VEED) {
      await runLeg({
        model: 'VEED_FABRIC',
        title: 'E2E smoke — veed talking head',
        createInput: { model: 'VEED_FABRIC', seedImageUrl, audioUrl: AUDIO_URL },
        timeoutMs: 360_000,
        cost: 300,
      });
    }

    // ── Ledger ──────────────────────────────────────────────────────────────
    const balance = await prisma.creditBalance.findUnique({ where: { userId: user.id } });
    const txns = await prisma.creditTransaction.findMany({ where: { userId: user.id } });
    const usageTotal = txns.filter((t) => t.type === 'USAGE').reduce((s, t) => s + t.amount, 0);
    check('ledger charged exactly', balance?.balance === 5000 - spent && usageTotal === -spent, `balance=${balance?.balance} spent=${spent} txns=${txns.length}`);
  } catch (err) {
    check('e2e completed', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (KEEP) {
      console.log('\n--keep: fixtures left in place for inspection\n');
    } else {
      console.log('\nCleaning up…');
      try {
        for (const key of createdKeys) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        }
        if (createdKeys.length) console.log(`  ${createdKeys.length} R2 object(s) deleted`);
        let gone = true;
        for (const key of createdKeys) {
          try {
            await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            gone = false;
          } catch { /* not readable => removed */ }
        }
        check('R2 objects removed', gone, gone ? 'HeadObject no longer resolves' : 'object still readable!');
        // Videos reference jobs via job.videoId (SetNull on video delete), so
        // delete videos first, then jobs.
        for (const id of videoIds) await prisma.video.deleteMany({ where: { id } });
        for (const id of jobIds) await prisma.generationJob.deleteMany({ where: { id } });
        if (ids.user) {
          await prisma.creditTransaction.deleteMany({ where: { userId: ids.user } });
          await prisma.creditBalance.deleteMany({ where: { userId: ids.user } });
          await prisma.analyticsEvent.deleteMany({ where: { userId: ids.user } }).catch(() => undefined);
          await prisma.featureCreditRate.deleteMany({ where: { featureKey: { in: ['generate:flux2', 'generate:h3_max', 'generate:veed_fabric'] } } });
          await prisma.user.deleteMany({ where: { id: ids.user } });
        }
        const residue = await prisma.generationJob.count()
          + await prisma.video.count({ where: { id: { in: videoIds } } })
          + await prisma.user.count({ where: { id: ids.user } })
          + await prisma.creditTransaction.count({ where: { userId: ids.user } })
          + await prisma.featureCreditRate.count({ where: { featureKey: { in: ['generate:flux2', 'generate:h3_max', 'generate:veed_fabric'] } } });
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
