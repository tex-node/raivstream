/**
 * Phase 3 — Raivstream end-card (renderOutputDerivative) unit coverage.
 *
 * ffmpeg is absent in CI, so the filter graph is verified structurally: the args
 * must append exactly END_CARD_SECONDS of card, carry the attribution handle
 * (escaped for drawtext), and keep one continuous video+audio stream.
 */
import { describe, expect, it } from 'vitest';
import { END_CARD_SECONDS, buildEndCardArgs, escapeDrawtext } from '../render';

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
