#!/usr/bin/env tsx
/**
 * Gate D — fal visual-quality evaluation batch.
 *
 * Runs a bounded set of REAL fal generations through the proven staging path
 * (same adapters/contracts as `pnpm fal test`), waits out the known fal
 * rate-limit between submissions, and writes a manifest so outputs can be
 * downloaded and reviewed. Everything goes to the STAGING R2 bucket only
 * (`FAL_USE_PRODUCTION_STORAGE=false`); nothing touches production.
 *
 * Usage (from repo root):
 *   pnpm fal:quality [--only=flux2|h3max|veed] [--out=tmp/fal-quality/manifest.json]
 *
 * Batch (default):
 *   FLUX2 × 6 (storybook, anime, cinematic landscape, photoreal portrait for
 *              the VEED presenter, folktale, 3D animated)
 *   H3_MAX × 2 (image-to-video from two of those stills)
 *   VEED   × 1 (photoreal presenter + the known staging veed-smoke audio fixture)
 *
 * Cost: ~9 real fal submissions on the funded account (bounded, explicit).
 */

import { config } from 'dotenv';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

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

loadCredFile(resolve(__dirname, '../cred/fal_env.txt'));

// ─── Enable the fal gates for this explicit quality batch ────────────────────
process.env.FAL_MEDIA_PROVIDER_ENABLED = 'true';
process.env.FAL_REAL_PROVIDER_CALLS_ENABLED = 'true';
process.env.FAL_IMAGE_ENABLED = 'true';
process.env.FAL_VIDEO_ENABLED = 'true';
process.env.FAL_UGC_ENABLED = 'true';
process.env.FAL_MAX_REQUESTS = process.env.FAL_MAX_REQUESTS ?? '20';
process.env.FAL_USE_PRODUCTION_STORAGE = 'false';

import { submitFalFlux2, getFalFlux2Status } from '../packages/api/src/lib/generators/falFlux2';
import { submitFalH3Max, getFalH3MaxStatus } from '../packages/api/src/lib/generators/falH3Max';
import { submitFalVeed, getFalVeedStatus } from '../packages/api/src/lib/generators/falVeed';

const RATE_PAUSE_MS = 25_000;
const POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 360_000;

const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
const OUT_PATH = OUT_ARG ?? 'tmp/fal-quality/manifest.json';

const RUN_FLUX2 = !ONLY_ARG || ONLY_ARG === 'flux2';
const RUN_H3MAX = !ONLY_ARG || ONLY_ARG === 'h3max';
const RUN_VEED = !ONLY_ARG || ONLY_ARG === 'veed';

interface Flux2Spec { label: string; prompt: string; aspectRatio: string }
const FLUX2_SPECS: Flux2Spec[] = [
  {
    label: 'storybook-puppy',
    prompt: 'A golden retriever puppy wearing a tiny blue backpack, walking toward a schoolhouse on a sunny morning, warm watercolor storybook illustration, soft light, gentle textures',
    aspectRatio: '9:16',
  },
  {
    label: 'anime-heroine',
    prompt: 'A young heroine with silver hair holding a glowing crystal staff, night sky with shooting stars, vibrant anime key visual, dramatic rim lighting, clean linework',
    aspectRatio: '9:16',
  },
  {
    label: 'cinematic-lighthouse',
    prompt: 'A lighthouse on a basalt cliff at sunset with seabirds circling, cinematic film still, anamorphic, moody teal and amber grade, volumetric light',
    aspectRatio: '16:9',
  },
  {
    label: 'photoreal-presenter',
    prompt: 'Close-up portrait of a young Nigerian woman, warm studio lighting, photorealistic, head and shoulders framing, neutral background, broadcast quality',
    aspectRatio: '9:16',
  },
  {
    label: 'folktale-baobab',
    prompt: 'A boy and his talking tortoise crossing a baobab grove at golden hour, African folktale illustration, rich earth tones, stylized but warm',
    aspectRatio: '1:1',
  },
  {
    label: '3d-robot-delivery',
    prompt: 'A cute round robot delivering parcels in a rainy futuristic city, Pixar-style 3D render, soft global illumination, adorable proportions',
    aspectRatio: '9:16',
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type JobResult = { status: string; outputUrl?: string; providerJobId?: string; error?: string; seconds: number };

async function pollToCompletion(
  label: string,
  poll: (jobId: string) => Promise<{ status: string; outputUrl?: string; error?: { message?: string } }>,
  jobId: string,
): Promise<JobResult> {
  const started = Date.now();
  for (;;) {
    const res = await poll(jobId);
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (res.status === 'completed') return { status: 'completed', outputUrl: res.outputUrl, providerJobId: jobId, seconds: elapsed };
    if (res.status === 'failed' || res.status === 'cancelled') {
      return { status: res.status, providerJobId: jobId, error: res.error?.message, seconds: elapsed };
    }
    if (elapsed > JOB_TIMEOUT_MS / 1000) {
      return { status: 'timeout', providerJobId: jobId, error: `still ${res.status} after ${elapsed}s`, seconds: elapsed };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function main(): Promise<void> {
  console.log('\nGate D — fal visual-quality evaluation batch\n');

  const publicBase = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  const manifest: Record<string, JobResult> = {};
  let first = true;
  async function pause(): Promise<void> {
    if (!first) {
      console.log(`  …pause ${Math.round(RATE_PAUSE_MS / 1000)}s (fal rate-limit)…`);
      await sleep(RATE_PAUSE_MS);
    }
    first = false;
  }

  const results: Array<{ key: string; label: string; kind: string; ok: boolean; detail: string }> = [];
  const record = (key: string, label: string, kind: string, ok: boolean, detail: string) => {
    results.push({ key, label, kind, ok, detail });
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${key} (${kind}) — ${detail}`);
  };

  // ── FLUX2 image batch ─────────────────────────────────────────────────────
  if (RUN_FLUX2) {
    for (const spec of FLUX2_SPECS) {
      await pause();
      try {
        const jobId = await submitFalFlux2({ prompt: spec.prompt, aspectRatio: spec.aspectRatio });
        const res = await pollToCompletion(spec.label, (id) => getFalFlux2Status(id), jobId);
        manifest[spec.label] = res;
        const url = res.outputUrl ?? '';
        record(spec.label, spec.prompt, 'flux2', res.status === 'completed', `${res.status} ${res.seconds}s ${url}`);
      } catch (err) {
        manifest[spec.label] = { status: 'error', error: err instanceof Error ? err.message : String(err), seconds: 0 };
        record(spec.label, spec.prompt, 'flux2', false, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ── H3_MAX image-to-video from selected stills ────────────────────────────
  if (RUN_H3MAX) {
    const seeds: Array<{ label: string; seedKey: string; prompt: string }> = [
      { label: 'h3max-puppy', seedKey: 'storybook-puppy', prompt: 'Slow cinematic push-in, the puppy walks toward the schoolhouse, ears flapping gently, warm morning light, gentle camera drift' },
      { label: 'h3max-lighthouse', seedKey: 'cinematic-lighthouse', prompt: 'Slow aerial drift toward the lighthouse, waves rolling, clouds moving, seabirds gliding, dusk light' },
    ];
    for (const seed of seeds) {
      const seedUrl = manifest[seed.seedKey]?.outputUrl;
      if (!seedUrl) {
        record(seed.label, seed.prompt, 'h3max', false, `skipped — no flux2 output for seed '${seed.seedKey}'`);
        continue;
      }
      await pause();
      try {
        const jobId = await submitFalH3Max({ prompt: seed.prompt, seedImageUrl: seedUrl, duration: 6 });
        const res = await pollToCompletion(seed.label, (id) => getFalH3MaxStatus(id), jobId);
        manifest[seed.label] = res;
        record(seed.label, seed.prompt, 'h3max', res.status === 'completed', `${res.status} ${res.seconds}s ${res.outputUrl ?? ''}`);
      } catch (err) {
        manifest[seed.label] = { status: 'error', error: err instanceof Error ? err.message : String(err), seconds: 0 };
        record(seed.label, seed.prompt, 'h3max', false, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ── VEED talking-video (photoreal presenter + staging audio fixture) ──────
  if (RUN_VEED) {
    const presenterUrl = manifest['photoreal-presenter']?.outputUrl;
    if (!presenterUrl) {
      record('veed-talk', '', 'veed', false, 'skipped — no photoreal-presenter flux2 output');
    } else {
      const audioUrl = `${publicBase}/generated/staging-audio/veed-smoke-1789929828334.mp3`;
      await pause();
      try {
        const jobId = await submitFalVeed({ imageUrl: presenterUrl, audioUrl });
        const res = await pollToCompletion('veed-talk', (id) => getFalVeedStatus(id), jobId);
        manifest['veed-talk'] = res;
        record('veed-talk', '', 'veed', res.status === 'completed', `${res.status} ${res.seconds}s ${res.outputUrl ?? ''}`);
      } catch (err) {
        manifest['veed-talk'] = { status: 'error', error: err instanceof Error ? err.message : String(err), seconds: 0 };
        record('veed-talk', '', 'veed', false, err instanceof Error ? err.message : String(err));
      }
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), publicBase, results, manifest }, null, 2));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nResult: ${passed}/${results.length} succeeded\nManifest: ${OUT_PATH}\n`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error('\nBatch crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});