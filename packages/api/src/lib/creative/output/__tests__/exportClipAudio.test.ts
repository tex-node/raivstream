/**
 * E1 — renderOutputDerivative preserves source clip native audio.
 *
 * The stitched export previously mixed only narration + background music, so
 * non-educational exports (no narration cues) were silent even though the source
 * H3 clips carry audible SFX. These tests assert the CONSTRUCTED filter graph
 * (ffmpeg is not available in unit runs; `ffmpeg`/`probe` are injected).
 *
 *   1. one clip with audio → the export includes it (ambience bed)
 *   2. no clip audio + no cues → video-only, unchanged (no audio added)
 *   3. clip audio + narration → both mixed
 *   4. clip audio + music → both mixed
 *   5. the end card is appended in all cases
 */

import { describe, it, expect, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { renderOutputDerivative, type OutputRenderDeps, type MediaProbe } from '../render';
import { deriveOutput } from '../derivation';

const DERIVATION = deriveOutput('PORTRAIT', null, 10);

function makeDeps(hasAudio: boolean): OutputRenderDeps & { ffmpegCalls: string[][]; probe: ReturnType<typeof vi.fn> } {
  const ffmpegCalls: string[][] = [];
  const probe = vi.fn(async (_p: string): Promise<MediaProbe> => ({ hasAudioStream: hasAudio, durationSeconds: 4 }));
  return {
    ffmpegCalls,
    probe,
    fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as unknown as typeof fetch,
    ffmpeg: vi.fn(async (args: string[]) => {
      ffmpegCalls.push(args);
      const outArg = [...args].reverse().find((a) => a.endsWith('.mp4') || a.endsWith('.wav'));
      if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
    }),
    upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
    endCardPreflight: async () => ({ drawtext: true, font: true, ok: true }),
  };
}

const VIDEO_ONLY_SCENE = { sceneId: 's1', videoUrl: 'https://cdn.test/v.mp4' };
const NARRATED_SCENE = { sceneId: 's1', videoUrl: 'https://cdn.test/v.mp4', audioUrl: 'https://cdn.test/a.mp3' };
const allArgs = (calls: string[][]) => calls.map((c) => c.join(' ')).join('\n');

describe('E1 — renderOutputDerivative preserves source clip audio', () => {
  it('1. one clip with audio → the export includes it (ambience bed built)', async () => {
    const deps = makeDeps(true);
    await renderOutputDerivative({ scenes: [VIDEO_ONLY_SCENE], derivation: DERIVATION, r2Prefix: 'pfx' }, deps);
    expect(deps.probe).toHaveBeenCalled();
    expect(allArgs(deps.ffmpegCalls)).toContain('adelay=');
  });

  it('2. no clip audio + no cues → video-only, unchanged (no audio added)', async () => {
    const deps = makeDeps(false);
    await renderOutputDerivative({ scenes: [VIDEO_ONLY_SCENE], derivation: DERIVATION, r2Prefix: 'pfx' }, deps);
    expect(allArgs(deps.ffmpegCalls)).not.toContain('adelay=');
    expect(allArgs(deps.ffmpegCalls)).not.toContain('amix');
  });

  it('3. clip audio + narration → both mixed (per-scene amix)', async () => {
    const deps = makeDeps(true);
    await renderOutputDerivative({ scenes: [NARRATED_SCENE], derivation: DERIVATION, r2Prefix: 'pfx' }, deps);
    const args = allArgs(deps.ffmpegCalls);
    expect(args).toContain('[na]');
    expect(args).toContain('[nr]');
    expect(args).toContain('amix=inputs=2');
  });

  it('4. clip audio + music → both mixed', async () => {
    const deps = makeDeps(true);
    await renderOutputDerivative({ scenes: [VIDEO_ONLY_SCENE], derivation: DERIVATION, r2Prefix: 'pfx', backgroundMusicUrl: 'https://cdn.test/music.mp3' }, deps);
    const args = allArgs(deps.ffmpegCalls);
    expect(args).toContain('volume=0.3'); // background music present
    expect(args).toContain('adelay='); // native clip audio present
    expect(args).toContain('[base][amb]amix=inputs=2'); // both combined
  });

  it('5. the end card is appended in all cases', async () => {
    const narrated = makeDeps(true);
    await renderOutputDerivative({ scenes: [NARRATED_SCENE], derivation: DERIVATION, r2Prefix: 'pfx' }, narrated);
    expect(allArgs(narrated.ffmpegCalls)).toContain('drawtext');

    const videoOnly = makeDeps(true);
    await renderOutputDerivative({ scenes: [VIDEO_ONLY_SCENE], derivation: DERIVATION, r2Prefix: 'pfx' }, videoOnly);
    expect(allArgs(videoOnly.ffmpegCalls)).toContain('drawtext');
  });
});
