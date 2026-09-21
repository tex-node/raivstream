#!/usr/bin/env tsx
/**
 * fal.ai staging smoke-test CLI.
 *
 * Loads the isolated staging FAL + R2 credentials from `cred/fal_env.txt`
 * (gitignored) and enables the default-off FAL_* switches for a bounded,
 * explicit smoke test. Never reads production env; never writes production R2.
 *
 * Usage (from repo root):
 *   pnpm fal info                                   — show config + capability gates
 *   pnpm fal test flux2 "<prompt>" [aspectRatio]    — FLUX.2 text-to-image
 *   pnpm fal test h3max "<prompt>" <imageUrl> [duration] — MiniMax H3-Max image-to-video
 *   pnpm fal test veed <imageUrl> <audioUrl>        — VEED Fabric talking-video
 *   pnpm fal status <model> <jobId>                 — poll a prior job (fal:<requestId>)
 *
 * Every test submits then polls to completion and prints the R2-mirrored URL.
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

// ─── Load isolated staging credentials (wins over .env) ───────────────────────
function loadCredFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`❌  Missing credential file: ${path}`);
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

// ─── Enable the fal gates for this explicit smoke test ────────────────────────
process.env.FAL_MEDIA_PROVIDER_ENABLED = 'true';
process.env.FAL_REAL_PROVIDER_CALLS_ENABLED = 'true';
process.env.FAL_IMAGE_ENABLED = 'true';
process.env.FAL_VIDEO_ENABLED = 'true';
process.env.FAL_UGC_ENABLED = 'true';
process.env.FAL_MAX_REQUESTS = process.env.FAL_MAX_REQUESTS ?? '10';
process.env.FAL_USE_PRODUCTION_STORAGE = 'false';

// Dynamic imports AFTER env is configured so adapters read the staging config.
import { submitFalFlux2, getFalFlux2Status } from '../packages/api/src/lib/generators/falFlux2';
import { submitFalH3Max, getFalH3MaxStatus } from '../packages/api/src/lib/generators/falH3Max';
import { submitFalVeed, getFalVeedStatus } from '../packages/api/src/lib/generators/falVeed';
import { readFalMediaConfig } from '../packages/api/src/lib/mediaProviders';

type Model = 'flux2' | 'h3max' | 'veed';

interface StatusShape {
  jobId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

async function cmdInfo(): Promise<void> {
  const cfg = readFalMediaConfig();
  console.log('\n🔑  fal.ai media config (staging)\n');
  console.log('  credential        ', cfg.credentialPresent ? 'FAL_KEY present' : 'MISSING');
  console.log('  endpoints         ');
  console.log('    image            ', cfg.endpoints.image);
  console.log('    video            ', cfg.endpoints.video);
  console.log('    ugc              ', cfg.endpoints.ugc);
  console.log('  R2 bucket          ', process.env.R2_BUCKET_NAME ?? 'MISSING');
  console.log('  R2 public url      ', process.env.R2_PUBLIC_URL ?? 'MISSING');
  console.log('  max requests       ', cfg.maxRequests);
  console.log('  image live         ', cfg.imageEnabled);
  console.log('  video live         ', cfg.videoEnabled);
  console.log('  ugc live           ', cfg.ugcEnabled);
  console.log();
}

async function submit(model: Model, args: string[]): Promise<string> {
  if (model === 'flux2') {
    const prompt = args[0];
    const aspectRatio = args[1];
    if (!prompt) throw new Error('Usage: pnpm fal test flux2 "<prompt>" [aspectRatio]');
    return submitFalFlux2({ prompt, ...(aspectRatio ? { aspectRatio } : {}) });
  }
  if (model === 'h3max') {
    const prompt = args[0];
    const imageUrl = args[1];
    const duration = args[2] ? Number(args[2]) : undefined;
    if (!prompt || !imageUrl) throw new Error('Usage: pnpm fal test h3max "<prompt>" <imageUrl> [duration]');
    return submitFalH3Max({ prompt, seedImageUrl: imageUrl, ...(duration ? { duration } : {}) });
  }
  // veed
  const imageUrl = args[0];
  const audioUrl = args[1];
  if (!imageUrl || !audioUrl) throw new Error('Usage: pnpm fal test veed <imageUrl> <audioUrl>');
  return submitFalVeed({ imageUrl, audioUrl });
}

function poller(model: Model): (jobId: string) => Promise<StatusShape> {
  if (model === 'flux2') return getFalFlux2Status;
  if (model === 'h3max') return getFalH3MaxStatus;
  return getFalVeedStatus;
}

async function cmdTest(model: Model, args: string[]): Promise<void> {
  const jobId = await submit(model, args);
  console.log(`\n  ✅  Submitted: ${jobId}\n`);
  await pollToCompletion(model, jobId);
}

async function pollToCompletion(model: Model, jobId: string): Promise<void> {
  const getStatus = poller(model);
  let attempts = 0;
  for (;;) {
    const res = await getStatus(jobId);
    attempts += 1;
    process.stdout.write(`\r  [${new Date().toLocaleTimeString()}] ${res.status.padEnd(12)} (attempt ${attempts})`);
    if (res.status === 'completed') {
      console.log('\n\n  ✅  COMPLETED');
      console.log('  R2 URL:', res.outputUrl ?? '(none)');
      break;
    }
    if (res.status === 'failed') {
      console.log('\n\n  ❌  FAILED');
      console.log('  Error:', res.error ?? '(none)');
      break;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log();
}

async function cmdStatus(model: Model, jobId: string): Promise<void> {
  if (!jobId) throw new Error('Usage: pnpm fal status <model> <jobId>');
  console.log(`\n🔄  Polling ${model} job ${jobId}...\n`);
  await pollToCompletion(model, jobId);
}

const [,, cmd, ...args] = process.argv;

(async () => {
  switch (cmd) {
    case 'info':
      await cmdInfo();
      break;
    case 'test':
      await cmdTest(args[0] as Model, args.slice(1));
      break;
    case 'status':
      await cmdStatus(args[0] as Model, args[1]);
      break;
    default:
      console.log(`
fal.ai staging CLI

  pnpm fal info
  pnpm fal test flux2 "<prompt>" [aspectRatio]
  pnpm fal test h3max "<prompt>" <imageUrl> [duration]
  pnpm fal test veed <imageUrl> <audioUrl>
  pnpm fal status <model> <jobId>
`);
  }
})().catch((err) => {
  console.error('\n❌  Error:', err instanceof Error ? err.message : err);
  // NOTE: set exitCode and let the process exit naturally instead of calling
  // process.exit() — a hard exit can trip a Node/libuv UV_HANDLE_CLOSING
  // assertion on Windows when provider HTTP handles are still draining.
  // Cosmetic only; the error above is the real signal.
  process.exitCode = 1;
});
