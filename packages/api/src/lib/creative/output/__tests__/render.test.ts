/**
 * Phase C — renderOutputDerivative background music mux.
 *
 * Tests that:
 *   A. Video-only path without music produces one ffmpeg call, no music fetch.
 *   B. Video-only path WITH music downloads music, calls ffmpeg with amix filter.
 *   C. Audio (narration) path without music: concat → rename (no amix step).
 *   D. Audio (narration) path WITH music: concat → amix overlay.
 *   E. Music fetch failure throws descriptive error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { renderOutputDerivative } from '../render';
import type { OutputRenderDeps } from '../render';
import { deriveOutput } from '../derivation';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<{
  fetchResponses: Map<string, Buffer | null>;
  uploadUrl: string;
}>  = {}): OutputRenderDeps & { ffmpegCalls: string[][] } {
  const ffmpegCalls: string[][] = [];
  const fetchResponses = overrides.fetchResponses ?? new Map();

  return {
    ffmpegCalls,
    fetch: vi.fn(async (url: string) => {
      const buf = fetchResponses.get(url as string);
      if (buf === null) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
      const data = buf ?? Buffer.alloc(32, 0x01);
      return { ok: true, status: 200, arrayBuffer: async () => data.buffer } as unknown as Response;
    }) as typeof fetch,
    ffmpeg: vi.fn(async (args: string[]) => {
      ffmpegCalls.push(args);
      // Create a stub output file (last .mp4 arg) so readFile and rename succeed.
      const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
      if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
    }),
    upload: vi.fn(async (_buf: Buffer, _key: string, _ct: string) => overrides.uploadUrl ?? 'https://cdn.test/out.mp4'),
  };
}

const DERIVATION = deriveOutput('PORTRAIT', null, 10);

const VIDEO_URL = 'https://cdn.test/video.mp4';
const AUDIO_URL = 'https://cdn.test/audio.mp3';
const MUSIC_URL = 'https://cdn.test/music.mp3';

const VIDEO_SCENE = { sceneId: 's1', videoUrl: VIDEO_URL };
const AUDIO_SCENE = { sceneId: 's1', videoUrl: VIDEO_URL, audioUrl: AUDIO_URL };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderOutputDerivative — Phase C background music', () => {

  describe('A. Video-only path, no music', () => {
    it('calls ffmpeg once, no music fetch', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [VIDEO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
      }, deps);

      // 1 video encode + 1 end-card append = 2 calls
      expect(deps.ffmpegCalls).toHaveLength(2);
      expect(deps.fetch).toHaveBeenCalledTimes(1); // video only
    });
  });

  describe('B. Video-only path WITH music', () => {
    it('fetches music and calls ffmpeg twice (video encode + amix)', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [VIDEO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
        backgroundMusicUrl: MUSIC_URL,
      }, deps);

      // 2 ffmpeg calls: encode video-only, then add music track
      expect(deps.ffmpegCalls).toHaveLength(2);

      // Second call must include volume=0.3 for the music layer
      const musicArgs = deps.ffmpegCalls[1]!.join(' ');
      expect(musicArgs).toContain('volume=0.3');

      // fetch: video + music
      expect(deps.fetch).toHaveBeenCalledTimes(2);
      const fetchedUrls = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(VIDEO_URL);
      expect(fetchedUrls).toContain(MUSIC_URL);
    });

    it('includes fade-in and atrim in the music filter', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [VIDEO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
        backgroundMusicUrl: MUSIC_URL,
      }, deps);

      const musicArgs = deps.ffmpegCalls[1]!.join(' ');
      expect(musicArgs).toContain('afade=t=in');
      expect(musicArgs).toContain('atrim=duration');
    });
  });

  describe('C. Audio (narration) path, no music', () => {
    it('calls ffmpeg for each scene plus one concat, no extra amix call', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [AUDIO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
      }, deps);

      // 1 per-scene mux + 1 concat + 1 end card = 3 calls, no music amix
      expect(deps.ffmpegCalls).toHaveLength(3);
      const concatArgs = deps.ffmpegCalls[1]!.join(' ');
      expect(concatArgs).toContain('concat=n=1');
      expect(concatArgs).not.toContain('amix');
    });
  });

  describe('D. Audio (narration) path WITH music', () => {
    it('calls ffmpeg: per-scene mux + concat + amix overlay', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [AUDIO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
        backgroundMusicUrl: MUSIC_URL,
      }, deps);

      // 1 per-scene mux + 1 concat + 1 music amix + 1 end card = 4 calls
      expect(deps.ffmpegCalls).toHaveLength(4);

      const amixArgs = deps.ffmpegCalls[2]!.join(' ');
      expect(amixArgs).toContain('amix');
      expect(amixArgs).toContain('volume=0.3');
      expect(amixArgs).toContain('-shortest');
    });

    it('fetches video, audio, and music', async () => {
      const deps = makeDeps();
      await renderOutputDerivative({
        scenes: [AUDIO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
        backgroundMusicUrl: MUSIC_URL,
      }, deps);

      const fetchedUrls = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(VIDEO_URL);
      expect(fetchedUrls).toContain(AUDIO_URL);
      expect(fetchedUrls).toContain(MUSIC_URL);
    });
  });

  describe('E. Music fetch failure', () => {
    it('throws when background music URL returns non-200', async () => {
      const fetchResponses = new Map<string, Buffer | null>([
        [MUSIC_URL, null], // null → 404 response
      ]);
      const deps = makeDeps({ fetchResponses });
      await expect(renderOutputDerivative({
        scenes: [VIDEO_SCENE],
        derivation: DERIVATION,
        r2Prefix: 'pfx',
        backgroundMusicUrl: MUSIC_URL,
      }, deps)).rejects.toThrow('Failed to fetch background music');
    });
  });

});
