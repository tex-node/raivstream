/**
 * Phase 9B.2C — Section 35 real API evaluation harness (OpenAI leg only).
 *
 * RESEARCH-ONLY. Not part of the production runtime, not wired into
 * VoiceGenerationProvider, not queued through any production path.
 *
 * - No production DB, no production R2, no production queue.
 * - Reads OPENAI_API_KEY from env only. Never logs it, never writes it to
 *   the manifest.
 * - Writes results to a local output directory only (no DB writes at all).
 * - Deterministic, capped request count — see MAX_REQUESTS / spend estimate
 *   printed at the top of the run. This script refuses to run past its
 *   fixed benchmark plan; it does not loop unboundedly.
 * - Real ffprobe validation of every generated file via the same
 *   probeAudioAsset abstraction the production worker uses, so technical
 *   audio-quality numbers here are directly comparable to Phase 9B.2C.1's
 *   own READY gate.
 *
 * Usage (staging only):
 *   OPENAI_API_KEY=... pnpm exec tsx scripts/phase9b2c-provider-benchmark-openai.ts
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { probeAudioAsset } from '../src/lib/audioMixing';

const OUTPUT_DIR = path.join(process.cwd(), '.provider-benchmark-output', 'openai');
const MODEL = 'tts-1';
const VOICE = 'alloy';

// Section 5 fixed benchmark corpus (verbatim from the phase brief) plus a
// handful of Section 4 use-case classes. Kept intentionally small — this is
// a capped, conservative research pass, not the full 15-class x N-provider
// matrix the brief describes (that requires credentials this environment
// does not have for the other 7 providers).
const CORPUS: Array<{ id: string; testClass: string; performanceIntent: string | null; text: string }> = [
  { id: 'narration-neutral', testClass: 'CINEMATIC_NARRATOR', performanceIntent: null, text: "The rain had stopped before sunrise. By the time Amara reached the old station, the city was already awake." },
  { id: 'dialogue-calm', testClass: 'ADULT_CHARACTER_DIALOGUE', performanceIntent: 'calm', text: "We have enough time. Check the map again, and we'll decide together." },
  { id: 'dialogue-excited', testClass: 'HIGH_ENERGY_CHARACTER', performanceIntent: 'excited', text: "You found it! I knew the door had to be here somewhere!" },
  { id: 'emotional', testClass: 'QUIET_EMOTIONAL_CHARACTER', performanceIntent: 'reflective', text: "I thought I'd forgotten this place, but somehow it still feels like home." },
  { id: 'urgent', testClass: 'HIGH_ENERGY_CHARACTER', performanceIntent: 'tense', text: "Move now. The bridge closes in two minutes." },
  { id: 'nigerian-english-context', testClass: 'NIGERIAN_ENGLISH', performanceIntent: null, text: "We'll meet at the gate after the programme. If the traffic from Lekki is heavy, send me a message." },
  { id: 'difficult-names', testClass: 'DIFFICULT_NAMES_PLACES', performanceIntent: null, text: "Lagos, Abeokuta, Akure, Mambilla, and Ijeshatedo were all on the route." },
  { id: 'long-paragraph', testClass: 'LONG_PARAGRAPH', performanceIntent: null, text: "The lighthouse keeper had lived alone on the point for eleven years, and in that time the sea had taught him more about patience than any person ever could. Ships passed at dusk, their lamps flickering like distant stars settling too low, and he counted them the way other people counted sheep." },
  { id: 'fast-short-line', testClass: 'FAST_SHORT_LINE', performanceIntent: 'fast', text: "Go, go, now!" },
  { id: 'two-person-a', testClass: 'TWO_PERSON_CONVERSATION', performanceIntent: 'warm', text: "\"Are you sure this is the right platform?\" \"Positive. Track nine, always has been.\"" },
];

type BenchmarkResult = {
  benchmarkVersion: 1;
  provider: 'openai';
  model: string;
  voice: string;
  testCase: string;
  performanceIntent: string | null;
  textHash: string;
  textLength: number;
  startTime: string;
  completionTime: string;
  latencyMs: number;
  audioDurationSeconds: number | null;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  fileSizeBytes: number;
  checksumSha256: string;
  success: boolean;
  failureCode: string | null;
  estimatedCostUsd: number;
};

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr}`))));
  });
}

// tts-1 list price: $15.00 / 1,000,000 characters.
function estimateCostUsd(charCount: number): number {
  return (charCount / 1_000_000) * 15;
}

async function synthesize(apiKey: string, text: string): Promise<{ buffer: Buffer; latencyMs: number; startTime: string; completionTime: string }> {
  const startTime = new Date();
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, voice: VOICE, input: text, response_format: 'wav' }),
  });
  const completionTime = new Date();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    latencyMs: completionTime.getTime() - startTime.getTime(),
    startTime: startTime.toISOString(),
    completionTime: completionTime.toISOString(),
  };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(JSON.stringify({ ok: false, note: 'NOT EXECUTED — CREDENTIALS UNAVAILABLE (OPENAI_API_KEY not set in this environment).' }));
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalChars = CORPUS.reduce((sum, c) => sum + c.text.length, 0);
  const estimatedMaxCostUsd = estimateCostUsd(totalChars);
  console.log(JSON.stringify({
    plan: {
      requestCount: CORPUS.length,
      totalChars,
      estimatedMaxCostUsd: Number(estimatedMaxCostUsd.toFixed(6)),
      note: 'Section 39 spend cap — this is the full estimated cost of the entire capped run, not per request.',
    },
  }, null, 2));

  const results: BenchmarkResult[] = [];

  for (const item of CORPUS) {
    const textHash = createHash('sha256').update(item.text).digest('hex');
    try {
      const { buffer, latencyMs, startTime, completionTime } = await synthesize(apiKey, item.text);
      const filePath = path.join(OUTPUT_DIR, `${item.id}.wav`);
      await writeFile(filePath, buffer);
      const probe = await probeAudioAsset(filePath, runCommand);
      const checksum = createHash('sha256').update(buffer).digest('hex');

      results.push({
        benchmarkVersion: 1,
        provider: 'openai',
        model: MODEL,
        voice: VOICE,
        testCase: item.id,
        performanceIntent: item.performanceIntent,
        textHash,
        textLength: item.text.length,
        startTime,
        completionTime,
        latencyMs,
        audioDurationSeconds: probe.durationSeconds,
        codec: probe.codec,
        sampleRateHz: probe.sampleRateHz,
        channels: probe.channels,
        fileSizeBytes: buffer.byteLength,
        checksumSha256: checksum,
        success: probe.hasAudioStream && (probe.durationSeconds ?? 0) > 0,
        failureCode: null,
        estimatedCostUsd: Number(estimateCostUsd(item.text.length).toFixed(6)),
      });
      console.log(`[ok] ${item.id} — ${latencyMs}ms, ${probe.durationSeconds?.toFixed(2)}s audio, ${probe.codec}/${probe.sampleRateHz}Hz`);
    } catch (e) {
      results.push({
        benchmarkVersion: 1,
        provider: 'openai',
        model: MODEL,
        voice: VOICE,
        testCase: item.id,
        performanceIntent: item.performanceIntent,
        textHash,
        textLength: item.text.length,
        startTime: new Date().toISOString(),
        completionTime: new Date().toISOString(),
        latencyMs: -1,
        audioDurationSeconds: null,
        codec: null,
        sampleRateHz: null,
        channels: null,
        fileSizeBytes: 0,
        checksumSha256: '',
        success: false,
        failureCode: e instanceof Error ? e.message.slice(0, 200) : 'UNKNOWN_ERROR',
        estimatedCostUsd: Number(estimateCostUsd(item.text.length).toFixed(6)),
      });
      console.log(`[fail] ${item.id} — ${e instanceof Error ? e.message : e}`);
    }
  }

  // Small concurrency probe — 3 concurrent short requests (Section 12),
  // deliberately small and respectful of rate limits.
  const concurrencyText = 'Short concurrent probe line.';
  const concurrencyStart = Date.now();
  const concurrencySettled = await Promise.allSettled([1, 2, 3].map(() => synthesize(apiKey, concurrencyText)));
  const concurrencyResults = concurrencySettled.map((r, i) => ({
    index: i,
    ok: r.status === 'fulfilled',
    latencyMs: r.status === 'fulfilled' ? r.value.latencyMs : null,
    error: r.status === 'rejected' ? String(r.reason).slice(0, 200) : null,
  }));
  const concurrencyWallClockMs = Date.now() - concurrencyStart;

  const manifest = {
    benchmarkVersion: 1,
    provider: 'openai',
    model: MODEL,
    voice: VOICE,
    runAt: new Date().toISOString(),
    requestCount: results.length,
    successCount: results.filter((r) => r.success).length,
    results,
    concurrencyProbe: { concurrentRequests: 3, wallClockMs: concurrencyWallClockMs, results: concurrencyResults },
    totalEstimatedCostUsd: Number(results.reduce((s, r) => s + r.estimatedCostUsd, 0).toFixed(6)),
  };

  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, summary: { requestCount: manifest.requestCount, successCount: manifest.successCount, totalEstimatedCostUsd: manifest.totalEstimatedCostUsd }, outputDir: OUTPUT_DIR }, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
