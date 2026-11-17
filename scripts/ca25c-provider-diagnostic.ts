#!/usr/bin/env tsx
/**
 * CA25-C Provider Diagnostic (read-only, no credits, no code changes)
 *
 * Loads the same .env files as ca25b-assembly.ts, then reports the full
 * provider registry state so we can identify which provider is unconfigured
 * and which capability accounts for capabilitiesEnabled=10 vs 11.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getProviderRegistry, summarizeProviderRegistry } from '../packages/api/src/lib/mediaProviders/registry';
import { readFalMediaConfig, isFalCapabilityLive, falDisabledReason } from '../packages/api/src/lib/mediaProviders/config';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'apps', 'web', '.env.local'));
loadEnvFile(path.join(process.cwd(), 'packages', 'database', '.env'));

// ─── FAL detailed breakdown ───────────────────────────────────────────────────

const falCfg = readFalMediaConfig(process.env);
const falDetail = {
  mediaProviderEnabled: falCfg.mediaProviderEnabled,
  realProviderCallsEnabled: falCfg.realProviderCallsEnabled,
  imageEnabled: falCfg.imageEnabled,
  imageCondEnabled: falCfg.imageCondEnabled,
  videoEnabled: falCfg.videoEnabled,
  ugcEnabled: falCfg.ugcEnabled,
  maxRequests: falCfg.maxRequests,
  credentialPresent: falCfg.credentialPresent,
  imageLive: isFalCapabilityLive(falCfg, 'image'),
  imageCondLive: isFalCapabilityLive(falCfg, 'imageCond'),
  videoLive: isFalCapabilityLive(falCfg, 'video'),
  ugcLive: isFalCapabilityLive(falCfg, 'ugc'),
  imageCondReason: falDisabledReason(falCfg, 'imageCond'),
  imageReason: falDisabledReason(falCfg, 'image'),
  videoReason: falDisabledReason(falCfg, 'video'),
};

// ─── Full registry ────────────────────────────────────────────────────────────

const registry = getProviderRegistry(process.env);
const summary = summarizeProviderRegistry(registry);

console.log('\n=== CA25-C PROVIDER DIAGNOSTIC ===\n');
console.log('Summary:', JSON.stringify(summary, null, 2));

console.log('\n=== FAL DETAILED FLAGS ===\n');
console.log(JSON.stringify(falDetail, null, 2));

console.log('\n=== PROVIDER TABLE ===\n');
console.log('Provider       | Configured | Capabilities');
console.log('---------------|------------|-------------');
for (const p of registry) {
  const caps = p.capabilities
    .map((c) => `${c.kind}/${c.model}:configured=${c.configured},enabled=${c.enabled}${c.reason ? `,reason="${c.reason}"` : ''}`)
    .join(' | ');
  console.log(`${p.id.padEnd(14)} | ${String(p.configured).padEnd(10)} | ${caps}`);
}

console.log('\n=== ALL CAPABILITIES ===\n');
let capNum = 0;
for (const p of registry) {
  for (const c of p.capabilities) {
    capNum++;
    console.log(
      `${String(capNum).padStart(2)}. [${p.id}] ${c.kind}/${c.model} configured=${c.configured} enabled=${c.enabled}${c.reason ? ` reason="${c.reason}"` : ''}`,
    );
  }
}

console.log('\n=== TRANSFORM DEPENDENCY CHECK ===\n');
console.log('Transform IMAGE (FAL imageCond / FLUX Kontext):');
console.log(`  FAL_MEDIA_PROVIDER_ENABLED: ${falCfg.mediaProviderEnabled}`);
console.log(`  FAL_REAL_PROVIDER_CALLS_ENABLED: ${falCfg.realProviderCallsEnabled}`);
console.log(`  FAL_IMAGE_COND_ENABLED: ${falCfg.imageCondEnabled}`);
console.log(`  FAL_MAX_REQUESTS: ${falCfg.maxRequests}`);
console.log(`  FAL_KEY present: ${falCfg.credentialPresent}`);
console.log(`  imageCondLive (assertLive would pass): ${isFalCapabilityLive(falCfg, 'imageCond')}`);
console.log(`  disabled reason: ${falDisabledReason(falCfg, 'imageCond')}`);
console.log('Transform VIDEO (FAL video / MiniMax H3-Max):');
console.log(`  videoLive: ${isFalCapabilityLive(falCfg, 'video')}`);
console.log(`  disabled reason: ${falDisabledReason(falCfg, 'video')}`);
console.log('Assembly: requires only DB + R2 (no media provider) — always available if storage configured');

console.log('\n=== VERDICT ===');
const imageCondLive = isFalCapabilityLive(falCfg, 'imageCond');
const videoLive = isFalCapabilityLive(falCfg, 'video');
if (!falCfg.credentialPresent || !falCfg.mediaProviderEnabled) {
  console.log('BLOCKED — FAL not configured');
} else if (!imageCondLive) {
  console.log(`BLOCKED — FAL imageCond (FLUX Kontext) not live: ${falDisabledReason(falCfg, 'imageCond')}`);
} else if (!videoLive) {
  console.log(`BLOCKED — FAL video (MiniMax H3-Max) not live: ${falDisabledReason(falCfg, 'video')}`);
} else {
  const unconfigured = registry.filter((p) => !p.configured).map((p) => p.id);
  console.log(`TECHNICALLY UNBLOCKED — Transform dependencies healthy. Unconfigured provider(s): ${unconfigured.join(', ') || 'none'}`);
}
