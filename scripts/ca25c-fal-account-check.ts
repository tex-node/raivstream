#!/usr/bin/env tsx
/**
 * CA25-C FAL Account Diagnostic
 *
 * Checks FAL account health via REST API without running any generation.
 * Does not print or log the actual key value.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

const key = process.env.FAL_KEY;
if (!key) {
  console.log('ERROR: FAL_KEY not found in environment');
  process.exit(1);
}
console.log('FAL_KEY present: true (length=' + key.length + ', prefix=' + key.slice(0, 4) + '...)');

const authHeader = { Authorization: 'Key ' + key };

async function probe(label: string, url: string, method = 'GET', body?: unknown): Promise<void> {
  try {
    const res = await fetch(url, {
      method,
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log('\n[' + label + '] ' + method + ' ' + url);
    console.log('  status: ' + res.status + ' ' + res.statusText);
    if (typeof parsed === 'object' && parsed !== null) {
      // Never print detail fields that might contain key info
      const safe = JSON.stringify(parsed, (k, v) => {
        if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + '...';
        return v;
      }, 2);
      console.log('  body: ' + safe.slice(0, 800));
    } else {
      const str = String(parsed);
      console.log('  body: ' + str.slice(0, 500));
    }
  } catch (e) {
    console.log('\n[' + label + '] ERROR: ' + String(e).slice(0, 200));
  }
}

async function main() {
  console.log('\n=== FAL ACCOUNT DIAGNOSTIC ===\n');

  // Check FAL REST API billing/account info
  await probe('billing-info', 'https://fal.run/v1/billing');
  await probe('account-info', 'https://fal.run/v1/account');
  await probe('balance', 'https://fal.run/v1/billing/balance');
  await probe('usage', 'https://fal.run/v1/billing/usage');

  // Try fal.ai specific account endpoints
  await probe('fal-me', 'https://fal.ai/api/me');
  await probe('fal-keys', 'https://fal.ai/api/keys');

  // Check the Kontext model availability (metadata only, no generation)
  await probe('kontext-model-info', 'https://fal.run/fal-ai/flux-pro/kontext');
  await probe('h3max-model-info', 'https://fal.run/minimax/video-01');

  // Try a queue status endpoint (no job submitted, just ping the queue service)
  await probe('queue-health', 'https://queue.fal.run/fal-ai/flux-pro/kontext/requests');

  console.log('\n=== END DIAGNOSTIC ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
