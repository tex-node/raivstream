/**
 * I2V chain continuity (Phase 17) — extract the LAST frame of a scene clip and
 * store it in R2 as a seed image, so shot N+1 can be generated from the final
 * frame of shot N. This forces physical/spatial continuity across shot
 * boundaries (background, lighting, character position all carry over).
 *
 * Fail-soft: returns null on any failure so video generation always proceeds
 * with the scene's own still as the seed. Never throws.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG_PROBE_TIMEOUT_MS, ffmpegAbortSignal } from './ffmpegSafety';
import { uploadBufferToR2 } from './r2';

/**
 * Returns the duration of a video in seconds via ffprobe, or null on any
 * failure (network error, ffprobe not installed, non-video URL). Fail-soft
 * so the settle path can fall back to the requested duration.
 */
export async function getVideoDurationSeconds(videoUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    let stdout = '';
    // D-031: this probes a remote URL. Unbounded, a stalled socket held the
    // settle path open indefinitely; the abort kills the child and fails soft.
    const guard = ffmpegAbortSignal(FFMPEG_PROBE_TIMEOUT_MS);
    const child = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoUrl,
    ], { stdio: ['ignore', 'pipe', 'pipe'], signal: guard.signal });
    child.stdout.on('data', (chunk: Buffer) => { stdout += String(chunk); });
    child.on('error', () => { guard.cancel(); resolve(null); });
    child.on('close', (code) => {
      guard.cancel();
      if (code !== 0) { resolve(null); return; }
      try {
        const dur = parseFloat((JSON.parse(stdout) as { format?: { duration?: string } }).format?.duration ?? '');
        resolve(isFinite(dur) && dur > 0 ? dur : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const guard = ffmpegAbortSignal(FFMPEG_PROBE_TIMEOUT_MS);
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], signal: guard.signal });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => { guard.cancel(); reject(error); });
    child.on('close', (code) => {
      guard.cancel();
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export async function extractLastFrameAsSeedImage(
  videoUrl: string,
  keyPrefix: string,
): Promise<string | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'raivstream-lastframe-'));
  const outPath = path.join(dir, 'last-frame.png');
  try {
    await run('ffmpeg', ['-y', '-sseof', '-0.1', '-i', videoUrl, '-frames:v', '1', '-q:v', '2', outPath]);
    const buffer = await readFile(outPath);
    const url = await uploadBufferToR2(buffer, `${keyPrefix}/last-frame.png`, 'image/png');
    return url;
  } catch (error) {
    console.warn('[lastFrame] extraction failed — falling back to the scene seed:', (error as Error).message);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}