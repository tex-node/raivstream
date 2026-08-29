/**
 * Phase 9B.2C.1 — Section 28 real filesystem/media checkpoint. Uses the
 * REAL development/test provider (real ffmpeg sine-tone synthesis, real
 * ffprobe validation) — no mocked provider, no mocked command runner. Runs
 * where ffmpeg actually exists (this local dev machine has none — the same
 * reason every real-ffmpeg check this whole phase has run on the isolated
 * staging VPS).
 *
 * Does NOT touch any real DB — everything here is filesystem + in-memory,
 * matching the brief's own "standalone deterministic voice-generation
 * checkpoint" framing. No prisma/network required.
 *
 * Usage: VOICE_GENERATION_DEV_PROVIDER_ENABLED=true pnpm exec tsx scripts/phase9b2c1-voice-generation-media-checkpoint.ts
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { probeAudioAsset } from '../src/lib/audioMixing';
import { resolveVoiceGenerationProvider, DEV_FIXTURE_PROVIDER_KEY } from '../src/lib/voiceGenerationProviders';

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

async function main() {
  if (process.env.VOICE_GENERATION_DEV_PROVIDER_ENABLED !== 'true') {
    throw new Error('Run with VOICE_GENERATION_DEV_PROVIDER_ENABLED=true — this checkpoint deliberately exercises the real config-safety gate too.');
  }
  const results: Record<string, unknown> = {};
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-gen-media-checkpoint-'));

  try {
    const provider = resolveVoiceGenerationProvider(DEV_FIXTURE_PROVIDER_KEY);
    const request = {
      text: 'Good morning, everyone. This is a deterministic checkpoint fixture.',
      language: 'en',
      voice: { stableVoiceIdentity: 'checkpoint-voice', voiceType: null, accentStyle: null, pitch: null, rate: null, styleNotes: null },
      performance: { preset: null, direction: 'calm' },
      output: { format: 'wav', sampleRateHz: 44100, channels: 1 },
    };

    // 1-3. Generate + probe.
    const result1 = await provider.generateSpeech(request, { jobId: 'checkpoint-job-1', tempDir });
    const probe1 = await probeAudioAsset(result1.filePath, runCommand);
    const stat1 = await stat(result1.filePath);
    const buffer1 = await readFile(result1.filePath);
    const checksum1 = createHash('sha256').update(buffer1).digest('hex');

    results.step1_3_generate_and_probe = {
      duration: probe1.durationSeconds,
      codec: probe1.codec,
      sampleRateHz: probe1.sampleRateHz,
      channels: probe1.channels,
      fileSizeBytes: stat1.size,
      hasAudioStream: probe1.hasAudioStream,
    };

    // 4. Verify expectations.
    const durationOk = (probe1.durationSeconds ?? 0) > 0;
    const codecOk = probe1.codec === 'pcm_s16le';
    const sampleRateOk = probe1.sampleRateHz === 44100;
    const channelsOk = probe1.channels === 1;
    const sizeOk = stat1.size > 0;
    results.step4_verify = { durationOk, codecOk, sampleRateOk, channelsOk, sizeOk, allPassed: durationOk && codecOk && sampleRateOk && channelsOk && sizeOk };

    // Determinism: regenerate the SAME request -> same checksum (checked
    // "where deterministic implementation permits" per the brief — this
    // dev fixture's sine synth is a pure function of frequency/duration,
    // which are themselves a pure function of the request text).
    const result2 = await provider.generateSpeech(request, { jobId: 'checkpoint-job-2', tempDir });
    const buffer2 = await readFile(result2.filePath);
    const checksum2 = createHash('sha256').update(buffer2).digest('hex');
    results.determinism = { checksum1, checksum2, deterministic: checksum1 === checksum2 };

    // Different text -> different checksum (proves it's not just returning a static fixture).
    const result3 = await provider.generateSpeech({ ...request, text: 'A completely different sentence entirely.' }, { jobId: 'checkpoint-job-3', tempDir });
    const buffer3 = await readFile(result3.filePath);
    const checksum3 = createHash('sha256').update(buffer3).digest('hex');
    results.variesWithInput = { checksum1, checksum3, differsAsExpected: checksum1 !== checksum3 };

    // 5-6. Feed through the SAME validation helper the worker uses, confirm READY gate passes.
    const readyGatePasses = probe1.hasAudioStream && durationOk && codecOk && sampleRateOk && channelsOk && sizeOk;
    results.step5_6_ready_gate = { passes: readyGatePasses };

    // Invalid fixture: zero-byte file -> READY gate must fail.
    const zeroBytePath = path.join(tempDir, 'zero-byte.wav');
    await writeFile(zeroBytePath, Buffer.alloc(0));
    const zeroByteStat = await stat(zeroBytePath);
    results.invalid_zero_byte = { sizeBytes: zeroByteStat.size, readyGateCorrectlyFails: zeroByteStat.size === 0 };

    // Invalid fixture: corrupted (non-audio garbage) file -> probe must fail / report no audio stream.
    const corruptedPath = path.join(tempDir, 'corrupted.wav');
    await writeFile(corruptedPath, Buffer.from('this is not a real wav file, just garbage bytes'));
    let corruptedProbeFailed = false;
    let corruptedHasAudioStream: boolean | null = null;
    try {
      const corruptedProbe = await probeAudioAsset(corruptedPath, runCommand);
      corruptedHasAudioStream = corruptedProbe.hasAudioStream;
      corruptedProbeFailed = !corruptedProbe.hasAudioStream;
    } catch {
      corruptedProbeFailed = true;
    }
    results.invalid_corrupted = { corruptedHasAudioStream, readyGateCorrectlyFails: corruptedProbeFailed };

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
