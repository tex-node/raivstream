#!/usr/bin/env tsx
/**
 * Phase 16.2 smoke — Production Manifest Structurer (GPT-4o).
 *
 * Loads staged creds, enables the fail-closed switch, and runs a sample story
 * prose through `structureProductionManifest`, printing the manifest.
 *
 * Usage: pnpm manifest:smoke
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(__dirname, '../../../cred/fal_env.txt'), 'utf8');
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}
process.env.STORY_MANIFEST_STRUCTURER_ENABLED = 'true';

import { isManifestStructurerEnabled, structureProductionManifest } from '../src/lib/productionStructurer';

const PROSE = [
  'SCENE 1: THE DYING LIGHT',
  'The lighthouse tower rises like a stone finger piercing the bruised violet sky. Mira climbs the spiral stairs, her boots echoing against cold granite, each step a drumbeat against the silence. The air tastes of copper and ozone — storm weather. The flame flickers, a weakening pulse.',
  'SCENE 2: THE FORGOTTEN CHAMBER',
  'Deep beneath the tower, Mira finds a brass door sealed for a century. Lantern light spills across carved runes. The wind groans through unseen vents, and somewhere below, water drips in a slow, patient rhythm.',
  'SCENE 3: THE HEART OF THE STORM',
  'The storm breaks. Lightning splits the sky; the island tilts on its moorings. Mira shields the last ember with her coat while rain hammers the glass and the sea roars below.',
  'SCENE 4: THE REKINDLING',
  'With a steady hand and a whispered promise, Mira feeds the ember fresh oil. The flame catches, then blooms — a column of gold climbing the tower as the clouds part.',
  'SCENE 5: DAWN’S PROMISE',
  'Morning. The island floats calm above a carpet of cloud. Mira leans on the railing, a small figure with a big light, ready for whatever the sky brings next.',
].join('\n\n');

async function main() {
  console.log('enabled:', isManifestStructurerEnabled());
  const manifest = await structureProductionManifest({
    title: 'The Last Ember',
    logline: 'A young lantern keeper on a floating island must rekindle the lighthouse flame before the storm tears the island from the sky.',
    prose: PROSE,
    audienceMode: 'GENERAL',
  });
  console.log('title:', manifest.title);
  console.log('logline:', manifest.logline);
  console.log('scenes:', manifest.scenes.length);
  for (const scene of manifest.scenes) {
    console.log(`\n[scene ${scene.scene_id}] ${scene.camera_motion} · ${scene.duration_sec}s · ${scene.resolution}`);
    console.log('  narration:', scene.elevenlabs_narration.slice(0, 120));
    console.log('  prompt:', scene.minimax_video_prompt.slice(0, 220));
  }
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});