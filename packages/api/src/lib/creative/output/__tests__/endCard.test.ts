/**
 * Phase 3 — Raivstream end-card (renderOutputDerivative) unit coverage.
 *
 * ffmpeg is absent in CI, so the filter graph is verified structurally: the args
 * must append exactly END_CARD_SECONDS of card, carry the attribution handle
 * (escaped for drawtext), and keep one continuous video+audio stream.
 */
import { describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { END_CARD_SECONDS, END_CARD_PREFLIGHT_FAILED, buildEndCardArgs, escapeDrawtext, preflightFailureMessage, renderOutputDerivative } from '../render';
import { deriveOutput } from '../derivation';

function filterOf(args: string[]): string {
  const i = args.indexOf('-filter_complex');
  expect(i).toBeGreaterThanOrEqual(0);
  return args[i + 1]!;
}

describe('escapeDrawtext', () => {
  it('escapes the drawtext-special characters', () => {
    expect(escapeDrawtext("o'brien:x%y,z")).toBe("o\\'brien\\:x\\%y\\,z");
  });

  it('escapes backslashes first', () => {
    expect(escapeDrawtext('a:b\\c')).toBe('a\\:b\\\\c');
  });
});

describe('buildEndCardArgs', () => {
  const base = {
    mainPath: '/tmp/main.mp4',
    outputPath: '/tmp/final.mp4',
    width: 1080,
    height: 1920,
    handle: 'creator_handle',
    fontFile: null,
  };

  it('audio path: appends exactly 2s of card with a 2-segment continuous concat', () => {
    const args = buildEndCardArgs({ ...base, mainHasAudio: true, mainDurationSeconds: 0 });
    const filter = filterOf(args);

    expect(filter).toContain('drawtext');
    expect(filter).toContain('@creator_handle');
    expect(filter).toContain('Created on Raivstream');
    expect(filter).toContain('RAIVSTREAM');
    expect(filter).toContain('concat=n=2:v=1:a=1');
    expect(filter).toContain('[v0][0:a][v1][cdra]concat');

    // the card source is exactly END_CARD_SECONDS, and a `-t 2` guards the lavfi input
    expect(args.join(' ')).toContain(`color=c=black:s=1080x1920:d=${END_CARD_SECONDS}:r=30`);
    expect(args.some((a, i) => a === '-t' && args[i + 1] === String(END_CARD_SECONDS))).toBe(true);

    // output path is last; resolution/codec unchanged
    expect(args[args.length - 1]).toBe('/tmp/final.mp4');
    expect(args.join(' ')).toContain('libx264');
    expect(args.join(' ')).toContain('aac');
  });

  it('no-audio path: synthesises silent audio so the merged output keeps a continuous audio track', () => {
    const args = buildEndCardArgs({ ...base, mainHasAudio: false, mainDurationSeconds: 12 });
    const filter = filterOf(args);

    expect(filter).toContain('concat=n=2:v=1:a=1');
    expect(filter).toContain('[v0][1:a][v1][cdra]concat');
    // silent main audio is bounded to the main duration, card audio to 2s
    expect(args.some((a, i) => a === '-t' && args[i + 1] === '12')).toBe(true);
    expect(args.some((a, i) => a === '-t' && args[i + 1] === String(END_CARD_SECONDS))).toBe(true);
  });

  it('escapes a handle with drawtext-unsafe characters', () => {
    const args = buildEndCardArgs({ ...base, handle: "o'brien", mainHasAudio: true, mainDurationSeconds: 0 });
    expect(filterOf(args)).toContain("@o\\'brien");
  });

  it('falls back to a fontconfig default when no font file is given', () => {
    const args = buildEndCardArgs({ ...base, mainHasAudio: true, mainDurationSeconds: 0 });
    expect(filterOf(args)).not.toContain('fontfile=');
  });
});

describe('end-card preflight (best-effort skip)', () => {
  it('names the missing capability in the failure message', () => {
    const msg = preflightFailureMessage({ drawtext: false, font: false, ok: false });
    expect(msg).toContain(END_CARD_PREFLIGHT_FAILED);
    expect(msg).toContain('drawtext');
    expect(msg).toContain('font');
  });

  it('skips the end card (one ffmpeg call) when preflight fails, still uploading the main output', async () => {
    const ffmpeg = vi.fn(async (args: string[]) => {
      await writeFile(args[args.length - 1]!, Buffer.from('fake-mp4'));
    });
    const res = await renderOutputDerivative(
      { scenes: [{ sceneId: 's1', stillUrl: 'r2://still' }], derivation: deriveOutput('PORTRAIT', null, 6), r2Prefix: 'x/y', creatorHandle: 'ada' },
      {
        fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
        ffmpeg,
        upload: vi.fn(async () => 'r2://out.mp4'),
        endCardPreflight: async () => ({ drawtext: false, font: true, ok: false }),
      } as never,
    );
    expect(ffmpeg).toHaveBeenCalledTimes(2); // 1 segment + concat; card skipped by preflight
    expect(res.assetUrl).toBe('r2://out.mp4');
  });
});

describe('endCardApplied — render return value', () => {
  const commonInput = {
    scenes: [{ sceneId: 's1', stillUrl: 'r2://still' }],
    derivation: deriveOutput('PORTRAIT', null, 6),
    r2Prefix: 'x/y',
    creatorHandle: 'ada',
    exportId: 'exp-test-1',
  };
  const commonFetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response);
  const commonUpload = vi.fn(async () => 'r2://out.mp4');

  it('returns endCardApplied=true when preflight passes (card appended)', async () => {
    const ffmpeg = vi.fn(async (args: string[]) => {
      await writeFile(args[args.length - 1]!, Buffer.from('fake-mp4'));
    });
    const res = await renderOutputDerivative(
      commonInput,
      {
        fetch: commonFetch,
        ffmpeg,
        upload: commonUpload,
        endCardPreflight: async () => ({ drawtext: true, font: true, ok: true }),
        probe: async () => ({ hasAudioStream: false, durationSeconds: 2 }),
      } as never,
    );
    expect(res.endCardApplied).toBe(true);
    expect(ffmpeg).toHaveBeenCalledTimes(3); // 1 segment + concat + end card
  });

  it('returns endCardApplied=false when preflight fails (card skipped, export still completes)', async () => {
    const ffmpeg = vi.fn(async (args: string[]) => {
      await writeFile(args[args.length - 1]!, Buffer.from('fake-mp4'));
    });
    const res = await renderOutputDerivative(
      commonInput,
      {
        fetch: commonFetch,
        ffmpeg,
        upload: commonUpload,
        endCardPreflight: async () => ({ drawtext: false, font: true, ok: false }),
        probe: async () => ({ hasAudioStream: false, durationSeconds: 2 }),
      } as never,
    );
    expect(res.endCardApplied).toBe(false);
    expect(res.assetUrl).toBe('r2://out.mp4'); // export succeeds despite skip
    expect(ffmpeg).toHaveBeenCalledTimes(2);   // 1 segment + concat; card skipped
  });

  it('returns endCardApplied=true on video-only + background-music path', async () => {
    // This is the most common R16 path: no per-scene narration (not educational),
    // but project has background music. Must apply the end card.
    const ffmpeg = vi.fn(async (args: string[]) => {
      await writeFile(args[args.length - 1]!, Buffer.from('fake-mp4'));
    });
    const res = await renderOutputDerivative(
      { ...commonInput, backgroundMusicUrl: 'r2://bg.mp3' },
      {
        fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
        ffmpeg,
        upload: commonUpload,
        endCardPreflight: async () => ({ drawtext: true, font: true, ok: true }),
        probe: async () => ({ hasAudioStream: false, durationSeconds: 2 }),
      } as never,
    );
    expect(res.endCardApplied).toBe(true);
    // video encode + music mix + end card = 3 ffmpeg calls
    expect(ffmpeg).toHaveBeenCalledTimes(3);
  });
});
