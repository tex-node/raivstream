#!/usr/bin/env tsx
/**
 * Raivstream 5.0 — creative run diagnostics CLI (launch readiness, gate 6).
 *
 * Prints the sanitized production-run diagnostics for a project so the team can
 * investigate a failed run without opening raw generation/provider internals.
 *
 * Usage: pnpm exec tsx scripts/creative-run-diagnostics.ts <projectId>
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildRunDiagnostics } from '../packages/api/src/lib/creative/production/diagnostics';

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

async function main() {
  const projectId = process.argv[2];
  if (!projectId) throw new Error('usage: creative-run-diagnostics.ts <projectId>');
  const project = await prisma.creativeProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) throw new Error(`project ${projectId} not found`);
  const d = await buildRunDiagnostics(prisma as never, { projectId, userId: project.userId });
  console.log(JSON.stringify(d, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ status: 'FATAL', error: error instanceof Error ? error.message : String(error) }));
  await prisma.$disconnect();
  process.exit(1);
});
