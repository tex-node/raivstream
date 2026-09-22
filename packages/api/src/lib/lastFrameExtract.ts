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
import { uploadBufferToR2 } from './r2';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
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