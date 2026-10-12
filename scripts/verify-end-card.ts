/**
 * Operator verification for the Phase 3 end card.
 *
 * ffmpeg + ffprobe are REQUIRED (absent in CI). This generates a synthetic 6s
 * 1080x1920@30 silent clip, appends the real end card using the production
 * `buildEndCardArgs` (so the exact filter graph under test is the one that ships),
 * then ffprobe-asserts:
 *   - format.duration == SOURCE_SECONDS + END_CARD_SECONDS (8.0s ± 0.1)
 *   - exactly one h264 video stream and one aac audio stream
 *   - video dimensions are 1080x1920
 *
 * Run:  pnpm verify:end-card   (or: tsx scripts/verify-end-card.ts)
 * Exits 1 (with a clear message) on any assertion failure or if ffmpeg is absent.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEndCardArgs, END_CARD_SECONDS } from '../packages/api/src/lib/creative/output/render';

const W = 1080;
const H = 1920;
const SOURCE_SECONDS = 6;

function have(cmd: string): boolean {
  const r = spawnSync(cmd, ['-version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[verify-end-card] ${cmd} failed (exit ${r.status})`);
    process.exit(1);
  }
}

function main(): void {
  if (!have('ffmpeg') || !have('ffprobe')) {
    console.error('ffmpeg required for verification.');
    process.exit(1);
  }

  const dir = mkdtempSync(join(tmpdir(), 'verify-end-card-'));
  const source = join(dir, 'source.mp4');
  const out = join(dir, 'out.mp4');

  // 1. Synthetic silent source: 6s, 1080x1920, 30fps, h264 + aac.
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=${SOURCE_SECONDS}:r=30`,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', String(SOURCE_SECONDS),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart',
    source,
  ]);

  // 2. Append the end card using the PRODUCTION args.
  run('ffmpeg', [
    '-y',
    ...buildEndCardArgs({
      mainPath: source,
      mainHasAudio: true,
      mainDurationSeconds: 0,
      outputPath: out,
      width: W,
      height: H,
      handle: 'operator_check',
      fontFile: process.env.RAIVSTREAM_END_CARD_FONT ?? null,
    }),
  ]);

  // 3. Probe + assert.
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-of', 'json',
    out,
  ], { encoding: 'utf8' });
  if (probe.status !== 0 || !probe.stdout) {
    console.error('[verify-end-card] ffprobe failed to read the output');
    process.exit(1);
  }

  const data = JSON.parse(probe.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const duration = Number(data.format?.duration ?? '0');
  const streams = data.streams ?? [];
  const video = streams.filter((s) => s.codec_type === 'video');
  const audio = streams.filter((s) => s.codec_type === 'audio');

  const expected = SOURCE_SECONDS + END_CARD_SECONDS;
  const failures: string[] = [];
  if (Math.abs(duration - expected) > 0.1) failures.push(`duration ${duration}s != expected ${expected}s`);
  if (video.length !== 1 || video[0]?.codec_name !== 'h264') failures.push(`video streams: ${JSON.stringify(video)}`);
  if (audio.length !== 1 || audio[0]?.codec_name !== 'aac') failures.push(`audio streams: ${JSON.stringify(audio)}`);
  if (video[0] && (video[0].width !== W || video[0].height !== H)) failures.push(`dimensions ${video[0].width}x${video[0].height} != ${W}x${H}`);

  if (failures.length) {
    console.error(`[verify-end-card] FAILED:\n - ${failures.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[verify-end-card] PASS — duration ${duration.toFixed(2)}s, h264 ${W}x${H} + aac`);
  console.log(`[verify-end-card] output: ${out}`);
}

main();
