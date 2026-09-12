/**
 * VPC-2 visual-quality benchmark harness — MOCK / OFFLINE PIPELINE VALIDATION ONLY.
 *
 * This harness NEVER calls a real image/video provider. It:
 *   1. Produces deterministic V1 and V2 prompts for the existing 12-story / 32-scene
 *      benchmark corpus (same fixture as structural qualification).
 *   2. Renders a deterministic local mock "image" (SVG) per prompt, purely to validate
 *      that prompt composition plugs into an image-delivery boundary.
 *   3. Emits protected benchmark artifacts (prompt hashes, lengths, latency, manifest).
 *
 * IMPORTANT: mock output does NOT establish real visual image quality. The empirical
 * visual-quality comparison remains NOT EXECUTED unless a separately provisioned
 * non-production real provider is supplied. No network, no database, no R2, no credits.
 *
 * Run:
 *   tsx scripts/vpc2-visual-benchmark.ts
 * Optional:
 *   VPC2_BENCH_OUTPUT_DIR=/root/vpc2-visual-benchmark-mock
 *   VPC2_BENCH_PRINT_PROMPTS=true   (protected debug only; never in application UI)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STORIES } from '../packages/api/src/lib/visualPromptComposer/__tests__/benchmark';
import { compose as composeV2 } from '../packages/api/src/lib/visualPromptComposer/composer';
import { composeScenePromptText } from '../packages/api/src/routers/story';

const PROVIDER = 'mock-deterministic-local';
const MAX_PROMPT = 1800;
const MAX_NEG = 900;
const PRINT_PROMPTS = process.env.VPC2_BENCH_PRINT_PROMPTS === 'true';
const OUT_DIR = process.env.VPC2_BENCH_OUTPUT_DIR ?? path.join(os.tmpdir(), 'vpc2-visual-benchmark-mock');

// Count outbound network calls; must remain 0 for this harness.
let outboundFetchCalls = 0;
const originalFetch = globalThis.fetch;
(globalThis as unknown as { fetch: typeof fetch }).fetch = ((...args: Parameters<typeof fetch>) => {
  outboundFetchCalls++;
  return (originalFetch as typeof fetch)(...args);
}) as typeof fetch;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashHue(value: string): number {
  return parseInt(sha256(value).slice(0, 6), 16) % 360;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string),
  );
}

function renderMockSvg(input: {
  sceneId: string;
  storyTitle: string;
  sceneTitle: string;
  variant: 'V1' | 'V2';
  prompt: string;
  negative: string;
}): string {
  const hue = hashHue(input.prompt);
  const negHue = hashHue(input.negative);
  const chars = (input.prompt.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).slice(0, 4);
  const blobCount = Math.max(1, Math.min(4, chars.length));
  const blobs = Array.from({ length: blobCount })
    .map((_, i) => {
      const x = 120 + i * (480 / blobCount);
      return `<circle cx="${x}" cy="760" r="46" fill="hsl(${(hue + i * 40) % 360} 70% 60%)"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="hsl(${hue} 55% 72%)"/>
    <stop offset="100%" stop-color="hsl(${negHue} 45% 28%)"/>
  </linearGradient></defs>
  <rect width="720" height="1280" fill="url(#g)"/>
  <rect x="40" y="40" width="640" height="1200" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="3"/>
  ${blobs}
  <text x="360" y="120" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">MOCK TEST IMAGE — NOT REAL GENERATION</text>
  <text x="360" y="170" text-anchor="middle" font-family="Arial" font-size="22" fill="#fff">${escapeXml(input.variant)} · ${escapeXml(input.sceneId)}</text>
  <text x="360" y="980" text-anchor="middle" font-family="Arial" font-size="20" fill="#fff">${escapeXml(input.sceneTitle.slice(0, 48))}</text>
  <text x="360" y="1016" text-anchor="middle" font-family="Arial" font-size="16" fill="#fff">${escapeXml(input.storyTitle.slice(0, 48))}</text>
  <text x="360" y="1100" text-anchor="middle" font-family="Arial" font-size="14" fill="#fff">provider=${PROVIDER} · promptLen=${input.prompt.length} · hash=${sha256(input.prompt).slice(0, 12)}</text>
</svg>`;
}

type Variant = 'V1' | 'V2';

type SceneRecord = {
  benchmarkSceneId: string;
  storyId: string;
  storyTitle: string;
  audienceMode: string;
  visualStyle: string;
  variant: Variant;
  provider: string;
  promptHash: string;
  promptLength: number;
  negativeHash: string;
  negativeLength: number;
  providerRequestStatus: string;
  artifactPath: string;
  latencyMs: number;
  attempts: number;
  retryStatus: string;
  excluded: boolean;
  excludeReason: string | null;
  withinBudget: boolean;
  characterNamePresent: boolean;
  cameraPresent: boolean;
  compositionPresent: boolean;
  environmentPresent: boolean;
  overlayProtectionPresent: boolean;
  deterministicRepeat: boolean;
};

function checks(prompt: string, negative: string, charNames: string[]) {
  return {
    withinBudget: prompt.length <= MAX_PROMPT,
    characterNamePresent: charNames.length === 0 ? false : charNames.some((n) => prompt.includes(n)),
    cameraPresent: /shot|camera/i.test(prompt),
    compositionPresent: /composition|framing|9:16/i.test(prompt),
    environmentPresent: /setting|location|at the|in the|forest|school|pool|shore|market|den/i.test(prompt),
    overlayProtectionPresent: negative.includes('phone UI') && negative.includes('social media UI') && negative.includes('gallery UI'),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const records: SceneRecord[] = [];
  const latencies: number[] = [];
  const started = Date.now();

  for (const story of STORIES) {
    const charNames = story.characterMemory.map((c) => c.name);
    for (const scene of story.scenes) {
      const sceneContext = {
        id: scene.id,
        title: scene.title,
        description: scene.description,
        locationType: scene.locationType ?? null,
        indoorOutdoor: scene.indoorOutdoor ?? null,
        mood: scene.mood ?? null,
        emotion: scene.emotion ?? null,
        cameraStyle: scene.cameraStyle ?? null,
        timeOfDay: scene.timeOfDay ?? null,
        characters: story.characterMemory.map((c) => ({ name: c.name })),
        project: {
          title: story.title,
          audienceMode: story.audienceMode,
          visualStyle: story.visualStyle,
          theme: null,
          storyDna: null,
          characterMemory: story.characterMemory,
        },
      };

      // V1
      const v1a = composeScenePromptText({ scene: sceneContext as never, outputType: 'IMAGE', provider: 'FLUX', audienceMode: story.audienceMode });
      const v1b = composeScenePromptText({ scene: sceneContext as never, outputType: 'IMAGE', provider: 'FLUX', audienceMode: story.audienceMode });

      // V2
      const v2Input = {
        scene,
        project: {
          title: story.title,
          audienceMode: story.audienceMode,
          visualStyle: story.visualStyle,
          characterMemory: story.characterMemory,
        },
        medium: 'IMAGE' as const,
        maxPromptLength: MAX_PROMPT,
        maxNegativePromptLength: MAX_NEG,
        audienceMode: story.audienceMode,
      };
      const v2a = composeV2(v2Input);
      const v2b = composeV2(v2Input);

      const variants: Array<{ variant: Variant; prompt: string; negative: string; repeatPrompt: string }> = [
        { variant: 'V1', prompt: v1a.prompt, negative: v1a.negativePrompt, repeatPrompt: v1b.prompt },
        { variant: 'V2', prompt: v2a.prompt, negative: v2a.negativePrompt, repeatPrompt: v2b.prompt },
      ];

      for (const v of variants) {
        const t0 = performance.now();
        const svg = renderMockSvg({
          sceneId: scene.id,
          storyTitle: story.title,
          sceneTitle: scene.title,
          variant: v.variant,
          prompt: v.prompt,
          negative: v.negative,
        });
        const t1 = performance.now();
        const artifactPath = path.join(OUT_DIR, `${scene.id}_${v.variant}.svg`);
        fs.writeFileSync(artifactPath, svg, 'utf8');
        const c = checks(v.prompt, v.negative, charNames);
        latencies.push(t1 - t0);
        records.push({
          benchmarkSceneId: scene.id,
          storyId: story.id,
          storyTitle: story.title,
          audienceMode: story.audienceMode,
          visualStyle: story.visualStyle,
          variant: v.variant,
          provider: PROVIDER,
          promptHash: sha256(v.prompt),
          promptLength: v.prompt.length,
          negativeHash: sha256(v.negative),
          negativeLength: v.negative.length,
          providerRequestStatus: 'mock-generated',
          artifactPath,
          latencyMs: Number((t1 - t0).toFixed(3)),
          attempts: 1,
          retryStatus: 'none',
          excluded: false,
          excludeReason: null,
          withinBudget: c.withinBudget,
          characterNamePresent: c.characterNamePresent,
          cameraPresent: c.cameraPresent,
          compositionPresent: c.compositionPresent,
          environmentPresent: c.environmentPresent,
          overlayProtectionPresent: c.overlayProtectionPresent,
          deterministicRepeat: sha256(v.prompt) === sha256(v.repeatPrompt),
        });
        if (PRINT_PROMPTS && v.variant === 'V2') {
          fs.writeFileSync(path.join(OUT_DIR, `${scene.id}_V2.prompt.txt`), v.prompt, 'utf8');
        }
      }
    }
  }

  const byVariant = (variant: Variant) => records.filter((r) => r.variant === variant);
  const passRate = (arr: SceneRecord[], key: keyof SceneRecord) => {
    const n = arr.filter((r) => r[key] === true).length;
    return `${n}/${arr.length}`;
  };
  const lengthStats = (arr: SceneRecord[]) => {
    const a = arr.map((r) => r.promptLength).sort((x, y) => x - y);
    return { min: a[0], median: a[Math.floor((a.length - 1) / 2)], p95: a[Math.floor((a.length - 1) * 0.95)], max: a[a.length - 1] };
  };
  const lat = [...latencies].sort((x, y) => x - y);
  const latencyStats = { min: lat[0], median: lat[Math.floor((lat.length - 1) / 2)], p95: lat[Math.floor((lat.length - 1) * 0.95)], max: lat[lat.length - 1] };
  const v1 = byVariant('V1');
  const v2 = byVariant('V2');

  const summary = {
    mode: 'MOCK_PIPELINE_VALIDATION_ONLY',
    provider: PROVIDER,
    providerBoundary: 'local deterministic SVG renderer (no network, no DB, no R2, no credits)',
    corpus: { stories: STORIES.length, scenes: STORIES.reduce((n, s) => n + s.scenes.length, 0) },
    generatedArtifacts: records.length,
    outboundFetchCalls,
    allWithinBudget: records.every((r) => r.withinBudget),
    allDeterministic: records.every((r) => r.deterministicRepeat),
    v1: {
      promptLength: lengthStats(v1),
      characterNamePresent: passRate(v1, 'characterNamePresent'),
      cameraPresent: passRate(v1, 'cameraPresent'),
      compositionPresent: passRate(v1, 'compositionPresent'),
      environmentPresent: passRate(v1, 'environmentPresent'),
      overlayProtectionPresent: passRate(v1, 'overlayProtectionPresent'),
    },
    v2: {
      promptLength: lengthStats(v2),
      characterNamePresent: passRate(v2, 'characterNamePresent'),
      cameraPresent: passRate(v2, 'cameraPresent'),
      compositionPresent: passRate(v2, 'compositionPresent'),
      environmentPresent: passRate(v2, 'environmentPresent'),
      overlayProtectionPresent: passRate(v2, 'overlayProtectionPresent'),
    },
    latencyMs: latencyStats,
    durationMs: Date.now() - started,
    humanReview: 'NOT APPLICABLE — mock output does not represent real image quality',
    empiricalVisualQuality: 'NOT EXECUTED — REAL SAFE VISUAL PROVIDER UNAVAILABLE',
  };

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ summary, records }, null, 2), 'utf8');
  console.log('VPC2_MOCK_VISUAL_BENCHMARK');
  console.log(JSON.stringify(summary, null, 2));
  console.log('OUTPUT_DIR=' + OUT_DIR);
}

main();
