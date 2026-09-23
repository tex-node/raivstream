/**
 * Raivstream 5.0 — Output renderer (Slice 5B).
 *
 * Assembles the version's produced scene clips (in plan order, stills as
 * fallback) into ONE derivative video: center-crop to the target aspect,
 * normalize fps/timebase, then trim to the effective duration. This is the
 * mechanic behind "give me a vertical version for social" — the user never
 * specifies crops or cut points. Dependencies are injectable for hermetic tests.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uploadBufferToR2 } from '../../r2';
import type { OutputDerivation } from './derivation';

export interface OutputRenderDeps {
  fetch?: typeof fetch;
  ffmpeg?: (args: string[]) => Promise<void>;
  upload?: (buffer: Buffer, key: string, contentType: string) => Promise<string | null>;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export interface RenderScene {
  sceneId: string;
  videoUrl?: string | null;
  stillUrl?: string | null;
}

export async function renderOutputDerivative(
  input: { scenes: RenderScene[]; derivation: OutputDerivation; r2Prefix: string },
  deps: OutputRenderDeps = {},
): Promise<{ assetUrl: string }> {
  const doFetch = deps.fetch ?? fetch;
  const doFfmpeg = deps.ffmpeg ?? runFfmpeg;
  const doUpload = deps.upload ?? uploadBufferToR2;

  const dir = await mkdtemp(path.join(os.tmpdir(), 'raivstream-output-'));
  try {
    const inputs: string[] = [];
    for (const scene of input.scenes) {
      const url = scene.videoUrl ?? scene.stillUrl;
      if (!url) continue;
      const file = path.join(dir, `src-${inputs.length}.bin`);
      const response = await doFetch(url);
      if (!response.ok) continue;
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      inputs.push(file);
    }
    if (inputs.length === 0) throw new Error('No source media available to derive an output.');

    const { targetWidth: W, targetHeight: H } = input.derivation;
    const parts = inputs.map(
      (_, index) => `[${index}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v${index}]`,
    );
    const labels = inputs.map((_, index) => `[v${index}]`).join('');
    const concat = `${labels}concat=n=${inputs.length}:v=1:a=0[vout]`;
    const filter = [...parts, concat].join(';');

    const out = path.join(dir, 'out.mp4');
    const args = [
      ...inputs.flatMap((file) => ['-i', file]),
      '-filter_complex', filter,
      '-map', '[vout]',
      '-t', String(input.derivation.effectiveDurationSeconds),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      out,
    ];
    await doFfmpeg(args);
    const buffer = await readFile(out);
    const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${out}`;
    return { assetUrl };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}