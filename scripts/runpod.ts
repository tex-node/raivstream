#!/usr/bin/env tsx
/**
 * RunPod development CLI
 *
 * Usage (from repo root):
 *   pnpm runpod info                          — account balance + user info
 *   pnpm runpod endpoints                     — list all serverless endpoints
 *   pnpm runpod health <slug>                 — check endpoint worker health
 *   pnpm runpod test <model> "<prompt>"       — submit a test generation job
 *   pnpm runpod status <model> <jobId>        — poll a job until done
 *   pnpm runpod models                        — show all configured model slugs/IDs
 *
 * Models: flux | wan | seedance | ltx | hunyuan | cogvideo
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env — try web app .env.local first, then repo root .env
config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_KEY = process.env.RUNPOD_API_KEY;
if (!API_KEY) {
  console.error('❌  RUNPOD_API_KEY is not set in .env / .env.local');
  process.exit(1);
}

const BASE = 'https://api.runpod.ai/v2';
const REST  = 'https://rest.runpod.io/v1';

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return JSON.parse(body) as T;
}

async function apiPost<T>(url: string, data: unknown): Promise<T> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return JSON.parse(body) as T;
}

function fmt(label: string, value: unknown) {
  const v = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  console.log(`  ${label.padEnd(24)} ${v}`);
}

// ─── Model config ─────────────────────────────────────────────────────────────

const MODEL_CONFIG: Record<string, {
  slug:        () => string;
  testPayload: (prompt: string) => Record<string, unknown>;
  label:       string;
}> = {
  flux: {
    label:       'Flux.1 Dev',
    slug:        () => process.env.RUNPOD_FLUX_PUBLIC_ENDPOINT     ?? 'black-forest-labs-flux-1-dev',
    testPayload: (p) => ({ prompt: p, width: 768, height: 1344, num_inference_steps: 20, guidance: 3.5, image_format: 'JPEG', seed: -1 }),
  },
  wan: {
    label:       'Wan 2.6 T2V',
    slug:        () => process.env.RUNPOD_WAN26_T2V_ENDPOINT       ?? 'wan-2-6-t2v',
    testPayload: (p) => ({ prompt: p, duration: 5, size: '720*1280', seed: -1 }),
  },
  seedance: {
    label:       'Seedance 1.5 Pro I2V',
    slug:        () => process.env.RUNPOD_SEEDANCE_PUBLIC_ENDPOINT ?? 'seedance-v1-5-pro-i2v',
    testPayload: (p) => ({ prompt: p, image: 'https://picsum.photos/720/1280', duration: 4, aspect_ratio: '9:16', resolution: '720p' }),
  },
  ltx: {
    label:       'LTX-Video 2 (custom)',
    slug:        () => process.env.RUNPOD_LTX2_ENDPOINT_ID        ?? '',
    testPayload: (p) => ({ prompt: p, width: 576, height: 1024, num_frames: 25, steps: 20, cfg: 3.0, fps: 25 }),
  },
  hunyuan: {
    label:       'HunyuanVideo (custom)',
    slug:        () => process.env.RUNPOD_HUNYUAN_ENDPOINT_ID     ?? '',
    testPayload: (p) => ({ prompt: p, width: 720, height: 1280, num_frames: 24, steps: 20, fps: 24 }),
  },
  cogvideo: {
    label:       'CogVideoX (custom)',
    slug:        () => process.env.RUNPOD_COGVIDEOX_ENDPOINT_ID   ?? '',
    testPayload: (p) => ({ prompt: p, width: 480, height: 848, num_frames: 25, steps: 20, fps: 8 }),
  },
};

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdInfo() {
  console.log('\n🔑  RunPod Account\n');
  // RunPod account info is GraphQL only
  const gql = await apiPost<any>('https://api.runpod.io/graphql', {
    query: `{ myself { id email clientBalance } }`,
  });
  const me = gql?.data?.myself ?? {};
  fmt('User ID',        me.id            ?? '—');
  fmt('Email',          me.email         ?? '—');
  fmt('Credit balance', me.clientBalance != null ? `$${Number(me.clientBalance).toFixed(4)} USD` : '—');
  console.log();
}

async function cmdEndpoints() {
  console.log('\n📡  Serverless Endpoints\n');
  const gql = await apiPost<any>('https://api.runpod.io/graphql', {
    query: `{ myself { endpoints { id name gpuIds workersMin workersMax } } }`,
  });
  const list: any[] = gql?.data?.myself?.endpoints ?? [];
  if (!list.length) { console.log('  No custom endpoints found.\n  (Public endpoints like wan-2-6-t2v are not listed here — they are shared infrastructure.)\n'); return; }
  for (const ep of list) {
    console.log(`  ${ep.name ?? ep.id}`);
    fmt('  ID',      ep.id);
    fmt('  GPU',     (ep.gpuIds ?? []).join(', ') || '—');
    fmt('  Workers', `min ${ep.workersMin ?? 0} / max ${ep.workersMax ?? '?'}`);
    console.log();
  }
}

async function cmdHealth(slug: string) {
  if (!slug) { console.error('Usage: pnpm runpod health <endpoint-slug>'); process.exit(1); }
  console.log(`\n🏥  Health: ${slug}\n`);
  try {
    const data = await apiGet<any>(`${BASE}/${slug}/health`);
    const j = data.jobs    ?? {};
    const w = data.workers ?? {};
    fmt('Jobs in queue',     j.inQueue    ?? 0);
    fmt('Jobs in progress',  j.inProgress ?? 0);
    fmt('Jobs completed',    j.completed  ?? 0);
    fmt('Jobs failed',       j.failed     ?? 0);
    fmt('Workers idle',      w.idle       ?? 0);
    fmt('Workers running',   w.running    ?? 0);
    fmt('Workers throttled', w.throttled  ?? 0);
  } catch (err: any) {
    if (err.message?.startsWith('401')) {
      console.log('  ℹ️  Health stats unavailable for public endpoints (401 — shared infrastructure).');
      console.log('  Use "pnpm runpod test" to verify the endpoint accepts jobs.\n');
    } else {
      throw err;
    }
  }
  console.log();
}

async function cmdModels() {
  console.log('\n⚙️   Model Configuration\n');
  for (const [key, cfg] of Object.entries(MODEL_CONFIG)) {
    const slug = cfg.slug();
    const set  = slug ? '✅' : '❌ not set';
    console.log(`  ${key.padEnd(10)}  ${cfg.label}`);
    fmt('  slug/id', slug ? `${slug}  ${set}` : set);
    console.log();
  }
}

async function cmdTest(modelKey: string, prompt: string) {
  if (!modelKey || !prompt) {
    console.error('Usage: pnpm runpod test <model> "<prompt>"');
    console.error('Models:', Object.keys(MODEL_CONFIG).join(' | '));
    process.exit(1);
  }
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) { console.error(`Unknown model: ${modelKey}. Options: ${Object.keys(MODEL_CONFIG).join(', ')}`); process.exit(1); }
  const slug = cfg.slug();
  if (!slug) { console.error(`❌  No endpoint configured for ${modelKey}`); process.exit(1); }

  console.log(`\n🚀  Submitting test job to ${cfg.label} (${slug})\n`);
  const payload = cfg.testPayload(prompt);
  console.log('  Payload:', JSON.stringify(payload, null, 2));

  const result = await apiPost<any>(`${BASE}/${slug}/run`, { input: payload });
  console.log(`\n  ✅  Job ID: ${result.id}`);
  console.log(`  Status:   ${result.status}`);
  console.log(`\n  Poll with:  pnpm runpod status ${modelKey} ${result.id}\n`);
}

async function cmdStatus(modelKey: string, jobId: string) {
  if (!modelKey || !jobId) {
    console.error('Usage: pnpm runpod status <model> <jobId>');
    process.exit(1);
  }
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) { console.error(`Unknown model: ${modelKey}`); process.exit(1); }
  const slug = cfg.slug();
  if (!slug) { console.error(`❌  No endpoint configured for ${modelKey}`); process.exit(1); }

  console.log(`\n🔄  Polling ${cfg.label} job ${jobId}...\n`);

  let attempts = 0;
  while (true) {
    const data = await apiGet<any>(`${BASE}/${slug}/status/${jobId}`);
    const status = data.status;
    attempts++;
    process.stdout.write(`\r  [${new Date().toLocaleTimeString()}] Status: ${status.padEnd(12)} (attempt ${attempts})`);

    if (status === 'COMPLETED') {
      console.log('\n\n  ✅  COMPLETED');
      console.log('  Output:', JSON.stringify(data.output, null, 2));
      break;
    }
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'TIMED_OUT') {
      console.log(`\n\n  ❌  ${status}`);
      if (data.error) console.log('  Error:', data.error);
      break;
    }

    await new Promise(r => setTimeout(r, 5_000));
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

(async () => {
  switch (cmd) {
    case 'info':      await cmdInfo();                       break;
    case 'endpoints': await cmdEndpoints();                  break;
    case 'health':    await cmdHealth(args[0]);              break;
    case 'models':    await cmdModels();                     break;
    case 'test':      await cmdTest(args[0], args[1]);       break;
    case 'status':    await cmdStatus(args[0], args[1]);     break;
    default:
      console.log(`
RunPod Dev CLI

  pnpm runpod info                     Account balance + user info
  pnpm runpod endpoints                List all serverless endpoints
  pnpm runpod health <slug>            Worker health for an endpoint
  pnpm runpod models                   Show configured model slugs/IDs
  pnpm runpod test <model> "<prompt>"  Submit a test job
  pnpm runpod status <model> <jobId>   Poll a job until done

Models: ${Object.keys(MODEL_CONFIG).join(' | ')}
`);
  }
})().catch(err => {
  console.error('\n❌  Error:', err.message);
  process.exit(1);
});
