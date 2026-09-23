/**
 * Raivstream 5.0 — Creative observability (Phase 9).
 *
 * Measure first: the Phase 9 performance priorities are intent latency, plan
 * latency, preview latency, first-visual latency, full-production latency,
 * review latency and output-derivation latency. This module records timings and
 * structured production events so the creator-facing experience can be measured
 * without exposing provider/job internals to the UI.
 */

export interface CreativeTiming {
  label: string;
  durationMs: number;
  ok: boolean;
  at: string;
}

const RING_SIZE = 200;
const ring: CreativeTiming[] = [];

export function recordCreativeTiming(label: string, durationMs: number, ok = true, at: Date = new Date()): CreativeTiming {
  const entry: CreativeTiming = { label, durationMs: Math.max(0, Math.round(durationMs)), ok, at: at.toISOString() };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  return entry;
}

export function getCreativeTimings(): CreativeTiming[] {
  return [...ring];
}

export function resetCreativeTimings(): void {
  ring.length = 0;
}

export function clearCreativeTimings(): void {
  resetCreativeTimings();
}

export async function timedCreative<T>(label: string, fn: () => Promise<T>, now: () => number = () => Date.now()): Promise<T> {
  const start = now();
  try {
    const result = await fn();
    recordCreativeTiming(label, now() - start, true);
    return result;
  } catch (error) {
    recordCreativeTiming(label, now() - start, false);
    throw error;
  }
}

export interface CreativeMetricSummary {
  label: string;
  count: number;
  failures: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function creativeMetricsSnapshot(): { total: number; labels: CreativeMetricSummary[] } {
  const byLabel = new Map<string, CreativeTiming[]>();
  for (const entry of ring) {
    const list = byLabel.get(entry.label) ?? [];
    list.push(entry);
    byLabel.set(entry.label, list);
  }
  const labels: CreativeMetricSummary[] = [];
  for (const [label, entries] of byLabel) {
    const durations = entries.map((entry) => entry.durationMs).sort((a, b) => a - b);
    const total = durations.reduce((sum, value) => sum + value, 0);
    labels.push({
      label,
      count: entries.length,
      failures: entries.filter((entry) => !entry.ok).length,
      avgMs: entries.length ? Math.round(total / entries.length) : 0,
      p95Ms: percentile(durations, 95),
      maxMs: durations[durations.length - 1] ?? 0,
    });
  }
  labels.sort((a, b) => b.count - a.count);
  return { total: ring.length, labels };
}

export type ProductionEvent =
  | { type: 'run_started'; projectId: string; runId: string | null; totalScenes: number; attempt: number }
  | { type: 'asset_started'; projectId: string; sceneId: string; kind: string; attempt: number }
  | { type: 'asset_ready'; projectId: string; sceneId: string; kind: string; durationMs: number }
  | { type: 'asset_failed'; projectId: string; sceneId: string; kind: string; attempt: number; final: boolean; message: string }
  | { type: 'run_finished'; projectId: string; runId: string | null; status: string; generated: number; failed: number };

/** Structured, safe production logs — never prompts, story text, URLs or secrets. */
export function logProductionEvent(event: ProductionEvent): void {
  console.info('[creative.production]', JSON.stringify(event));
}
