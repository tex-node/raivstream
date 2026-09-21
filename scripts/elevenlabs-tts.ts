#!/usr/bin/env tsx
/**
 * ElevenLabs TTS staging smoke-test CLI.
 *
 * Loads the isolated staging credentials from `cred/fal_env.txt` (gitignored;
 * includes the `11_LABS` staging key) and enables the default-off TTS gate
 * for a single bounded synthesis. Never reads production env; never touches
 * the DB, R2, or credits — this calls the ElevenLabs API only.
 *
 * Usage (from repo root):
 *   pnpm elevenlabs info                    — show config (key present? model? never prints secrets)
 *   pnpm elevenlabs test "[text]" [voiceId] — synthesize a short line, save MP3 to os.tmpdir()
 *
 * Cost: a few dozen characters of TTS (~negligible on a paid account).
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

// ─── Load isolated staging credentials (wins over .env) ───────────────────────
function loadCredFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`Missing credential file: ${path}`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadCredFile(resolve(__dirname, '../cred/fal_env.txt'));

// ─── Enable the TTS gate for this explicit smoke test ─────────────────────────
process.env.ELEVENLABS_TTS_ENABLED = 'true';

// Dynamic imports AFTER env is configured.
import {
  elevenLabsApiKey,
  elevenLabsDefaultVoiceId,
  elevenLabsModelId,
  isElevenLabsTtsEnabled,
  synthesizeSpeech,
} from '../packages/api/src/lib/generators/elevenLabsTts';

function isMp3(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // ElevenLabs MP3s carry an ID3v2 tag up front — accept that header...
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true; // "ID3"
  // ...otherwise look for an MPEG frame sync in the first 4KB.
  const window = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (let i = 0; i + 1 < window.length; i += 1) {
    if (window[i] === 0xff && (window[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

async function cmdInfo(): Promise<void> {
  console.log('\nElevenLabs TTS config (staging)\n');
  console.log('  key present :', elevenLabsApiKey() ? 'yes (11_LABS / ELEVENLABS_API_KEY)' : 'MISSING');
  console.log('  enabled     :', isElevenLabsTtsEnabled());
  console.log('  model       :', elevenLabsModelId());
  console.log('  voice       :', process.env.ELEVENLABS_DEFAULT_VOICE_ID ? '(custom override set)' : `${elevenLabsDefaultVoiceId()} (default)`);
  console.log();
}

async function cmdTest(text: string, voiceId?: string): Promise<void> {
  const sentence = text || 'Testing Raivstream narration. This is a short staging smoke test.';
  console.log(`\nSynthesizing ${sentence.length} chars...`);
  const started = Date.now();
  const audio = await synthesizeSpeech({ text: sentence, voiceId: voiceId ?? elevenLabsDefaultVoiceId() });
  const ms = Date.now() - started;

  const outPath = join(tmpdir(), `elevenlabs-smoke-${Date.now()}.mp3`);
  writeFileSync(outPath, audio);

  console.log('  bytes       :', audio.length);
  console.log('  mp3 magic   :', isMp3(audio) ? 'ok (MPEG frame sync present)' : 'UNEXPECTED (not MPEG audio)');
  console.log('  elapsed     :', `${ms}ms`);
  console.log('  saved to    :', outPath);
  if (!isMp3(audio)) process.exitCode = 1;
  console.log();
}

const [,, cmd, ...args] = process.argv;

(async () => {
  switch (cmd) {
    case 'info':
      await cmdInfo();
      break;
    case 'test':
      await cmdTest(args[0] ?? '', args[1]);
      break;
    default:
      console.log(`
ElevenLabs TTS staging CLI

  pnpm elevenlabs info
  pnpm elevenlabs test "[text]" [voiceId]
`);
  }
})().catch((err) => {
  // Never leak the key: only print the message, which the adapter redacts to status + 300 chars.
  console.error('\nError:', err instanceof Error ? err.message : err);
  process.exit(1);
});
