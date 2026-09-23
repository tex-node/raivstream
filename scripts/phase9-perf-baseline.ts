#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — performance baseline (launch readiness, gate 4).
 *
 * Measures the deterministic, user-facing stages of the creative pipeline and
 * reports P50 / P95 / max. These are the stages that run on every request and
 * define perceived responsiveness. Real-provider stages (FIRST_VISUAL, full
 * production, review, targeted regeneration, output derivation) are recorded by
 * the live smoke and the `[creative.production]` event stream; this script gives
 * the CPU/DB-independent floor.
 *
 * Usage: pnpm exec tsx scripts/phase9-perf-baseline.ts [--iterations 500]
 */

import { performance } from 'node:perf_hooks';
import { interpret } from '../packages/api/src/lib/creative/intent/interpreter';
import { buildCreativePlan } from '../packages/api/src/lib/creative/production/plan';
import { buildPreview } from '../packages/api/src/lib/creative/production/preview';
import { routeProduction } from '../packages/api/src/lib/creative/production/capabilityRouter';
import { buildProductionContext } from '../packages/api/src/lib/creative/production/contextAdapter';
import { interpretDirective } from '../packages/api/src/lib/creative/director/interpreter';
import { deriveOutput } from '../packages/api/src/lib/creative/output/derivation';

const N = Number(process.argv[process.argv.indexOf('--iterations') + 1]) || 500;

const PROMPTS = [
  'Create a 5-minute photorealistic short film about a young Nigerian woman returning home after 10 years abroad.',
  'Create a 3-minute lesson explaining photosynthesis to eight-year-olds.',
  'Create a 60-second cinematic commercial for a new Nigerian premium skincare brand.',
  'Make a beautiful video about a woman in Lagos.',
];

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return { p50: at(50), p95: at(95), max: sorted[sorted.length - 1], avg: sum / sorted.length, n: sorted.length };
}

function bench(label: string, iterations: number, fn: (i: number) => void) {
  for (let i = 0; i < 20; i += 1) fn(i); // warmup
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn(i);
    samples.push(performance.now() - start);
  }
  const s = stats(samples);
  console.log(JSON.stringify({
    stage: label,
    p50Ms: Number(s.p50.toFixed(2)),
    p95Ms: Number(s.p95.toFixed(2)),
    maxMs: Number(s.max.toFixed(2)),
    avgMs: Number(s.avg.toFixed(2)),
    n: s.n,
  }));
}

const bible = {
  version: 1,
  brand: { brandIdentity: { name: 'Voltaic Noir' }, approvedMessaging: ['Night belongs to you'] },
  visualLanguage: { style: 'noir cinematic' },
  characters: [{ name: 'Amara', visualDescription: 'young Nigerian woman' }],
  worlds: [],
} as never;
const brief = { originalIntent: PROMPTS[0], audience: 'young professionals', tone: 'noir' } as never;
const context = buildProductionContext({ brief, bible });
const plan = buildCreativePlan({ projectType: 'STORY', brief, bible, context });

console.log(JSON.stringify({ status: 'RUN', iterations: N }));
bench('intent.interpret', N, (i) => { interpret(PROMPTS[i % PROMPTS.length]); });
bench('plan.build', N, () => { buildCreativePlan({ projectType: 'STORY', brief, bible, context }); });
bench('preview.build', N, () => { buildPreview(plan, bible); });
bench('context.build', N, () => { buildProductionContext({ brief, bible }); });
bench('capability.route', N, () => { routeProduction(plan, bible, context); });
bench('director.interpret', N, (i) => { interpretDirective(i % 2 ? 'Make her more confident.' : 'Warm scene 1.', plan); });
bench('output.derive', N, () => { deriveOutput('LANDSCAPE', 30, plan.totalRuntimeSeconds); });
console.log(JSON.stringify({ status: 'COMPLETE' }));
