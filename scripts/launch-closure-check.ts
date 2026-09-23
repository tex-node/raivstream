#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — launch closure check.
 *
 * Reads docs/operations/launch-closure-evidence.json and produces the final
 * acceptance matrix + GO / CONDITIONAL GO decision. The decision becomes GO
 * ONLY when the three recorded conditions are complete:
 *   1. humanUx          — real creator sessions recorded (Gate 5)
 *   2. alertOwnership   — P0–P3 owners ratified and alerts wired (Gate 6)
 *   3. storageThresholds— thresholds ratified and enforcement enabled (Gate 6)
 *
 * It never mutates the evidence file. Run after recording evidence:
 *   pnpm exec tsx scripts/launch-closure-check.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'docs', 'operations', 'launch-closure-evidence.json');

if (!existsSync(FILE)) {
  console.error(`missing ${FILE}`);
  process.exit(1);
}

type Session = { journey: string; persona: string; participant: string | null; date: string | null; result: string };
type Evidence = {
  release: string;
  baselineCommit: string;
  humanUx: { status: string; facilitator: string | null; date: string | null; sessions: Session[]; acceptanceCriteriaMet: boolean };
  alertOwnership: { ratified: boolean; ratifiedBy: string | null; date: string | null; owners: Record<string, string | null>; escalation: string | null; alertsWired: boolean };
  storageThresholds: { ratified: boolean; ratifiedBy: string | null; date: string | null; values: Record<string, number | null>; enforcementEnabled: boolean };
};

const evidence = JSON.parse(readFileSync(FILE, 'utf8')) as Evidence;

const nonEmpty = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

// ── Condition 1 — Human UX (Gate 5) ──────────────────────────────────────────
const sessions = evidence.humanUx.sessions ?? [];
const journeys = new Set(sessions.filter((s) => s.result !== 'PENDING').map((s) => s.journey));
const humanUxComplete =
  evidence.humanUx.status === 'PASS' &&
  evidence.humanUx.acceptanceCriteriaMet === true &&
  nonEmpty(evidence.humanUx.facilitator) &&
  nonEmpty(evidence.humanUx.date) &&
  ['A', 'B', 'C'].every((journey) => journeys.has(journey)) &&
  sessions.filter((s) => s.result !== 'PENDING').every((s) => nonEmpty(s.participant) && nonEmpty(s.date));

// ── Condition 2 — Alert ownership (Gate 6) ───────────────────────────────────
const owners = evidence.alertOwnership.owners ?? {};
const alertComplete =
  evidence.alertOwnership.ratified === true &&
  evidence.alertOwnership.alertsWired === true &&
  nonEmpty(evidence.alertOwnership.ratifiedBy) &&
  nonEmpty(evidence.alertOwnership.date) &&
  nonEmpty(evidence.alertOwnership.escalation) &&
  ['P0', 'P1', 'P2', 'P3'].every((severity) => nonEmpty(owners[severity]));

// ── Condition 3 — Storage thresholds (Gate 6) ────────────────────────────────
const values = evidence.storageThresholds.values ?? {};
const thresholdKeys = ['totalAssetsWarn', 'totalAssetsCrit', 'failedAssetsWarn', 'stuckAssetsWarn', 'staleRunsWarn'];
const storageComplete =
  evidence.storageThresholds.ratified === true &&
  evidence.storageThresholds.enforcementEnabled === true &&
  nonEmpty(evidence.storageThresholds.ratifiedBy) &&
  nonEmpty(evidence.storageThresholds.date) &&
  thresholdKeys.every((key) => typeof values[key] === 'number');

// ── Matrix ───────────────────────────────────────────────────────────────────
const rows = [
  { gate: 'Reliability', status: 'PASS', evidence: 'launch.test.ts, runner.test.ts, live Journey R', open: 'none' },
  { gate: 'Data & Provenance', status: 'PASS', evidence: 'diagnostics (live), launch.test.ts, approval.test.ts', open: 'none' },
  { gate: 'Safety & Rights', status: 'PASS', evidence: 'safety.test.ts, live probe, live R16 307, adapter moderation', open: 'none' },
  { gate: 'Performance', status: 'PASS', evidence: 'phase9-telemetry-sample.ts (FIRST_VISUAL P50 6.2s)', open: 'small sample (observation)' },
  {
    gate: 'Human UX',
    status: humanUxComplete ? 'PASS' : 'PENDING',
    evidence: humanUxComplete ? `sessions: ${sessions.map((s) => `${s.journey}:${s.participant}`).join(', ')}` : 'ux-acceptance-sessions.md (no sessions recorded)',
    open: humanUxComplete ? 'none' : 'Gate 5 not executed',
  },
  {
    gate: 'Operations',
    status: alertComplete && storageComplete ? 'PASS' : 'CONDITIONAL',
    evidence: 'runbook, diagnostics, monitors, cost report, backup/restore, rollbacks',
    open: alertComplete && storageComplete ? 'none' : [!alertComplete && 'alert owners OPEN', !storageComplete && 'storage thresholds unratified'].filter(Boolean).join('; '),
  },
];

const remaining: string[] = [];
if (!humanUxComplete) remaining.push('Human UX acceptance (Gate 5) — record sessions in launch-closure-evidence.json');
if (!alertComplete) remaining.push('Alert-routing owners (Gate 6) — ratify P0–P3 + wire alerts');
if (!storageComplete) remaining.push('Storage thresholds (Gate 6) — ratify values + enable enforcement');

const decision = remaining.length === 0 ? 'GO' : 'CONDITIONAL GO';

console.log(JSON.stringify({
  release: evidence.release,
  baselineCommit: evidence.baselineCommit,
  matrix: rows,
  remainingConditions: remaining,
  decision,
}, null, 2));

if (decision === 'GO') {
  console.log('\nGO — Raivstream 5.0 is accepted for launch.');
} else {
  console.log(`\nCONDITIONAL GO — ${remaining.length} condition(s) remain.`);
  process.exit(2);
}
