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
import { mkdtemp, writeFile, readFile, rm, rename } from 'node:fs/promises';
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
  /** Narration audio URL for educational mux (R2-hosted MP3). Server-side only — never accepted from client input. */
  audioUrl?: string | null;
}

export async function renderOutputDerivative(
  input: { scenes: RenderScene[]; derivation: OutputDerivation; r2Prefix: string; backgroundMusicUrl?: string | null },
  deps: OutputRenderDeps = {},
): Promise<{ assetUrl: string }> {
  const doFetch = deps.fetch ?? fetch;
  const doFfmpeg = deps.ffmpeg ?? runFfmpeg;
  const doUpload = deps.upload ?? uploadBufferToR2;

  const { targetWidth: W, targetHeight: H } = input.derivation;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'raivstream-output-'));
  try {
    const hasAudio = input.scenes.some((s) => s.audioUrl);

    // ── Audio mux path (educational: per-scene loop+mux then concat) ──────────
    if (hasAudio) {
      // All scenes must have audio when any do — validated upstream but checked here.
      const missingAudio = input.scenes.filter((s) => !s.audioUrl).map((s) => s.sceneId);
      if (missingAudio.length > 0) {
        throw new Error(`Audio mux mode requires all scenes to have audioUrl. Missing: ${missingAudio.join(', ')}`);
      }

      const sceneParts: string[] = [];
      for (let i = 0; i < input.scenes.length; i++) {
        const scene = input.scenes[i]!;
        const videoSrc = scene.videoUrl ?? scene.stillUrl;
        if (!videoSrc) throw new Error(`Scene ${scene.sceneId} has no video source for audio mux.`);

        // Download video
        const vFile = path.join(dir, `v-${i}.bin`);
        const vResp = await doFetch(videoSrc);
        if (!vResp.ok) throw new Error(`Failed to fetch video for scene ${scene.sceneId} (${vResp.status})`);
        await writeFile(vFile, Buffer.from(await vResp.arrayBuffer()));

        // Download narration audio
        const aFile = path.join(dir, `a-${i}.bin`);
        const aResp = await doFetch(scene.audioUrl!);
        if (!aResp.ok) throw new Error(`Failed to fetch narration audio for scene ${scene.sceneId} (${aResp.status})`);
        await writeFile(aFile, Buffer.from(await aResp.arrayBuffer()));

        // Per-scene mux: loop video infinitely, end when narration audio ends (-shortest).
        // This handles narration longer than the clip (the common case for educational content)
        // and adds silence if narration is shorter than the clip.
        const sceneOut = path.join(dir, `scene-${i}.mp4`);
        await doFfmpeg([
          '-stream_loop', '-1',
          '-i', vFile,
          '-i', aFile,
          '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v]`,
          '-map', '[v]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          sceneOut,
        ]);
        sceneParts.push(sceneOut);
      }

      // Concat all per-scene muxed clips into the final export.
      const concat = path.join(dir, 'concat.mp4');
      const n = sceneParts.length;
      const segLabels = sceneParts.map((_, i) => `[${i}:v][${i}:a]`).join('');
      await doFfmpeg([
        ...sceneParts.flatMap((f) => ['-i', f]),
        '-filter_complex', `${segLabels}concat=n=${n}:v=1:a=1[vout][aout]`,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        concat,
      ]);

      const out = path.join(dir, 'out.mp4');
      if (input.backgroundMusicUrl) {
        // Mux background music under narration: loop music to full video length,
        // mix at 0.3 weight (narration 1.0), fade in/out 1 s each end.
        const mFile = path.join(dir, 'bg.bin');
        const mResp = await doFetch(input.backgroundMusicUrl);
        if (!mResp.ok) throw new Error(`Failed to fetch background music (${mResp.status})`);
        await writeFile(mFile, Buffer.from(await mResp.arrayBuffer()));
        await doFfmpeg([
          '-i', concat,
          '-stream_loop', '-1', '-i', mFile,
          '-filter_complex',
            // Narration: fade in 1 s only (duration unknown at build time; let -shortest cut it).
            '[0:a]afade=t=in:ss=0:d=1[narr];' +
            // Music: fade in 1 s, reduce to 30% volume.
            '[1:a]afade=t=in:ss=0:d=1,volume=0.3[bgm];' +
            '[narr][bgm]amix=inputs=2:duration=first:dropout_transition=2[amixed]',
          '-map', '0:v',
          '-map', '[amixed]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          '-movflags', '+faststart',
          out,
        ]);
      } else {
        // No background music — rename concat output as final.
        await rename(concat, out);
      }

      const buffer = await readFile(out);
      const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${out}`;
      return { assetUrl };
    }

    // ── Video-only path (non-educational, existing behavior unchanged) ─────────
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

    const parts = inputs.map(
      (_, index) => `[${index}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,settb=AVTB[v${index}]`,
    );
    const labels = inputs.map((_, index) => `[v${index}]`).join('');
    const concat = `${labels}concat=n=${inputs.length}:v=1:a=0[vout]`;
    const filter = [...parts, concat].join(';');

    if (input.backgroundMusicUrl) {
      // Video-only path + background music: produce a video+audio output.
      const videoOnly = path.join(dir, 'video-only.mp4');
      await doFfmpeg([
        ...inputs.flatMap((file) => ['-i', file]),
        '-filter_complex', filter,
        '-map', '[vout]',
        '-t', String(input.derivation.effectiveDurationSeconds),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        videoOnly,
      ]);
      const mFile = path.join(dir, 'bg.bin');
      const mResp = await doFetch(input.backgroundMusicUrl);
      if (!mResp.ok) throw new Error(`Failed to fetch background music (${mResp.status})`);
      await writeFile(mFile, Buffer.from(await mResp.arrayBuffer()));
      const out = path.join(dir, 'out.mp4');
      const totalDur = input.derivation.effectiveDurationSeconds;
      const fadeOutStart = Math.max(0, totalDur - 1);
      await doFfmpeg([
        '-i', videoOnly,
        '-stream_loop', '-1', '-i', mFile,
        '-filter_complex',
          `[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=${fadeOutStart}:d=1,volume=0.3,atrim=duration=${totalDur}[bgmt]`,
        '-map', '0:v',
        '-map', '[bgmt]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        out,
      ]);
      const buffer = await readFile(out);
      const assetUrl = (await doUpload(buffer, `${input.r2Prefix}/out.mp4`, 'video/mp4')) ?? `file://${out}`;
      return { assetUrl };
    }

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