/**
 * R16 — real FFmpeg/ffprobe render validation harness.
 *
 * Requires `ffmpeg` + `ffprobe` on PATH. Builds synthetic fixtures with lavfi,
 * then drives the PRODUCTION render pipeline (`renderOutputDerivative`) with
 * injected fetch/upload so there is **no R2, no network, no DB, and no live
 * provider**. Asserts on the real media that comes out:
 *   - narration-only export has both a video and an audio stream
 *   - narration+music export has both streams and the duration tracks narration
 *   - an unfetchable input surfaces as an error (failure handling)
 *   - the renderer's temp dir is cleaned up
 *
 * Usage (only in an environment with ffmpeg + ffprobe):
 *   pnpm --filter @raivstream/api exec tsx scripts/r16-render-validation.ts
 *
 * Exit codes: 0 = all pass, 1 = a check failed, 2 = ffmpeg/ffprobe unavailable.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderOutputDerivative, type RenderScene } from '../src/lib/creative/output/render';
import type { OutputDerivation } from '../src/lib/creative/output/derivation';

function run(cmd: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => (out += String(d)));
    c.stderr.on('data', (d) => (err += String(d)));
    c.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
    c.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

async function have(cmd: string): Promise<boolean> {
  const r = await run(cmd, ['-version']);
  return r.code === 0;
}

async function probe(file: string): Promise<any> {
  const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) throw new Error(`ffprobe failed: ${r.err.slice(-400)}`);
  return JSON.parse(r.out);
}

const results: Array<{ name: string; pass: boolean; detail: string }> = [];
function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
}

async function main(): Promise<void> {
  if (!(await have('ffmpeg')) || !(await have('ffprobe'))) {
    console.error('FFMPEG/FFPROBE NOT AVAILABLE — cannot run real-media validation.');
    console.error('Install ffmpeg + ffprobe on PATH in an approved isolated environment, then re-run.');
    process.exit(2);
  }

  const work = await mkdtemp(path.join(os.tmpdir(), 'r16-render-val-'));
  const tmpRoot = path.dirname(work);
  const derivation = {
    format: 'PORTRAIT',
    aspectRatio: '9:16',
    targetWidth: 1080,
    targetHeight: 1920,
    cropMode: 'fill',
    effectiveDurationSeconds: 4,
  } as unknown as OutputDerivation;

  // ── Synthetic fixtures (no network) ────────────────────────────────────────
  const videoA = path.join(work, 'videoA.mp4');
  const videoB = path.join(work, 'videoB.mp4');
  const narrA = path.join(work, 'narrA.mp3');
  const narrB = path.join(work, 'narrB.mp3');
  const music = path.join(work, 'music.mp3');
  const enc = async (out: string, args: string[]) => {
    const r = await run('ffmpeg', ['-y', ...args, out]);
    if (r.code !== 0) throw new Error(`fixture ${path.basename(out)} failed: ${r.err.slice(-300)}`);
  };
  await enc(videoA, ['-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
  await enc(videoB, ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
  await enc(narrA, ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libmp3lame']);
  await enc(narrB, ['-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:a', 'libmp3lame']);
  await enc(music, ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-c:a', 'libmp3lame']);

  // ── Injected deps: fetch from disk, upload persists the buffer ─────────────
  const served: Record<string, string> = {
    'file://videoA': videoA,
    'file://videoB': videoB,
    'file://narrA': narrA,
    'file://narrB': narrB,
    'file://music': music,
  };
  const fetchImpl = (async (url: string) => {
    const p = served[url];
    if (!p) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = await readFile(p);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  }) as unknown as typeof fetch;

  let uploaded: Buffer | null = null;
  const uploadImpl = async (buffer: Buffer): Promise<string> => {
    uploaded = buffer;
    return 'file:///validation-output.mp4';
  };

  const scenes: RenderScene[] = [
    { sceneId: 'S1', videoUrl: 'file://videoA', audioUrl: 'file://narrA' },
    { sceneId: 'S2', videoUrl: 'file://videoB', audioUrl: 'file://narrB' },
  ];
  const countTmp = async () => (await readdir(tmpRoot)).filter((n) => n.startsWith('raivstream-output-')).length;

  // ── Case 1: narration-only ─────────────────────────────────────────────────
  const before = await countTmp();
  const r1 = await renderOutputDerivative({ scenes, derivation, r2Prefix: 'validation' }, { fetch: fetchImpl, upload: uploadImpl });
  check('narration-only: asset URL returned', !!r1.assetUrl, r1.assetUrl);
  const out1 = path.join(work, 'out-narr.mp4');
  await writeFile(out1, uploaded!);
  const p1 = await probe(out1);
  const v1 = p1.streams.find((s: any) => s.codec_type === 'video');
  const a1 = p1.streams.find((s: any) => s.codec_type === 'audio');
  check('narration-only: video stream present', !!v1, v1 ? `${v1.codec_name} ${v1.width}x${v1.height}` : 'none');
  check('narration-only: audio stream present', !!a1, a1 ? a1.codec_name : 'none');
  const dur1 = parseFloat(p1.format.duration);
  check('narration-only: duration ~ narration (>=3s and <6s)', dur1 >= 3 && dur1 < 6, `${dur1}s`);
  check('renderer temp dir cleaned up', (await countTmp()) <= before, `before=${before}`);

  // ── Case 2: narration + music ──────────────────────────────────────────────
  const r2 = await renderOutputDerivative(
    { scenes, derivation, r2Prefix: 'validation', backgroundMusicUrl: 'file://music' },
    { fetch: fetchImpl, upload: uploadImpl },
  );
  check('music mix: asset URL returned', !!r2.assetUrl, r2.assetUrl);
  const out2 = path.join(work, 'out-music.mp4');
  await writeFile(out2, uploaded!);
  const p2 = await probe(out2);
  const v2 = p2.streams.find((s: any) => s.codec_type === 'video');
  const a2 = p2.streams.find((s: any) => s.codec_type === 'audio');
  check('music mix: video stream present', !!v2);
  check('music mix: audio stream present', !!a2, a2 ? a2.codec_name : 'none');
  const dur2 = parseFloat(p2.format.duration);
  check('music mix: duration tracks narration (>=3s)', dur2 >= 3, `${dur2}s`);

  // ── Case 3: failure handling (unfetchable input) ───────────────────────────
  let failed = false;
  try {
    await renderOutputDerivative(
      { scenes: [{ sceneId: 'X', videoUrl: 'file://missing', audioUrl: 'file://narrA' }], derivation, r2Prefix: 'validation' },
      { fetch: fetchImpl, upload: uploadImpl },
    );
  } catch {
    failed = true;
  }
  check('failure handling: unfetchable input rejects', failed);

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('\nR16 REAL-MEDIA RENDER VALIDATION');
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  const ok = results.every((r) => r.pass);
  console.log(`\n${ok ? 'ALL PASS' : 'FAILURES PRESENT'} (${results.filter((r) => r.pass).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
