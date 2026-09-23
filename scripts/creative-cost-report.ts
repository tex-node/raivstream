#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — creative generation cost report (launch closure, Gate 6).
 *
 * Operational visibility into generation cost derived from the existing credit
 * ledger (`CreditTransaction`) and feature rates — no new product capability.
 * The creative runner charges per generation with reference
 * `creative-produce-<assetId>-a<attempt>`, so cost is attributable to
 * project / scene / asset / provider / retry without any schema change.
 *
 * Usage: pnpm exec tsx scripts/creative-cost-report.ts [--days 30]
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'apps', 'web', '.env.local'));
loadEnvFile(path.join(process.cwd(), 'packages', 'database', '.env'));

const prisma = new PrismaClient();
const PREFIX = 'creative-produce-';
const REF = /^creative-produce-(.+)-a(\d+)$/;

function days(): number {
  const i = process.argv.indexOf('--days');
  return i >= 0 ? Number(process.argv[i + 1]) : 30;
}

async function main() {
  const since = new Date(Date.now() - days() * 24 * 60 * 60 * 1000);
  const txs = await prisma.creditTransaction.findMany({
    where: { referenceId: { startsWith: PREFIX }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  const assetIds = new Set<string>();
  const parsed = txs.map((tx) => {
    const match = tx.referenceId?.match(REF);
    const assetId = match?.[1] ?? null;
    if (assetId) assetIds.add(assetId);
    return { tx, assetId, attempt: match ? Number(match[2]) : null };
  });

  const assets = assetIds.size
    ? await prisma.creativeProducedAsset.findMany({ where: { id: { in: [...assetIds] } }, select: { id: true, projectId: true, sceneId: true, kind: true, status: true } })
    : [];
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const projectIds = [...new Set(assets.map((a) => a.projectId))];
  const projects = projectIds.length ? await prisma.creativeProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } }) : [];
  const titleById = new Map(projects.map((p) => [p.id, p.title]));

  const usage = parsed.filter((p) => p.tx.type === 'USAGE');
  const refunds = parsed.filter((p) => p.tx.type === 'REFUND');
  const creditsOut = usage.reduce((sum, p) => sum + Math.abs(p.tx.amount), 0);
  const creditsRefunded = refunds.reduce((sum, p) => sum + Math.abs(p.tx.amount), 0);

  const byFeature: Record<string, { credits: number; charges: number }> = {};
  for (const p of usage) {
    const key = p.tx.featureKey ?? 'unknown';
    byFeature[key] = byFeature[key] ?? { credits: 0, charges: 0 };
    byFeature[key].credits += Math.abs(p.tx.amount);
    byFeature[key].charges += 1;
  }

  const byProject: Record<string, { title: string; credits: number; charges: number }> = {};
  const byScene: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const chargesByAsset: Record<string, number> = {};
  // The runner description is `Creative production: <sceneId> <kind>` — used as a
  // fallback so regenerated/deleted assets still attribute to scene and kind.
  const DESC = /^Creative production:\s+(\S+)\s+(image|video)/i;
  for (const p of usage) {
    const asset = p.assetId ? assetById.get(p.assetId) : null;
    const projectId = asset?.projectId ?? 'deleted_or_regenerated';
    byProject[projectId] = byProject[projectId] ?? { title: titleById.get(projectId) ?? projectId, credits: 0, charges: 0 };
    byProject[projectId].credits += Math.abs(p.tx.amount);
    byProject[projectId].charges += 1;
    const desc = (p.tx.description ?? '').match(DESC);
    const sceneId = asset?.sceneId ?? desc?.[1];
    const kind = asset?.kind ?? (desc?.[2] ? desc[2].toUpperCase() : undefined);
    if (sceneId) byScene[sceneId] = (byScene[sceneId] ?? 0) + Math.abs(p.tx.amount);
    if (kind) byKind[kind] = (byKind[kind] ?? 0) + Math.abs(p.tx.amount);
    if (p.assetId) chargesByAsset[p.assetId] = (chargesByAsset[p.assetId] ?? 0) + 1;
  }
  const retriedAssets = Object.values(chargesByAsset).filter((count) => count > 1).length;
  const retryCredits = usage.reduce((sum, p) => {
    if (!p.assetId) return sum;
    return (chargesByAsset[p.assetId] ?? 0) > 1 ? sum + Math.abs(p.tx.amount) : sum;
  }, 0);

  const byDay: Record<string, number> = {};
  for (const p of usage) {
    const day = p.tx.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + Math.abs(p.tx.amount);
  }

  const runs = await prisma.creativeProductionRun.count({ where: { startedAt: { gte: since } } });
  const outputs = await prisma.creativeOutput.count({ where: { createdAt: { gte: since } } });

  console.log(JSON.stringify({
    status: 'COMPLETE',
    windowDays: days(),
    totals: { creditsOut, creditsRefunded, netCredits: creditsOut - creditsRefunded, charges: usage.length },
    byFeature,
    byProject: Object.entries(byProject).map(([id, v]) => ({ projectId: id, ...v })).sort((a, b) => b.credits - a.credits),
    byScene,
    byKind,
    retry: { retriedAssets, retryCredits },
    volume: { productions: runs, outputs, outputRenderCredits: 0 },
    byDay,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ status: 'FATAL', error: error instanceof Error ? error.message : String(error) }));
  await prisma.$disconnect();
  process.exit(1);
});
