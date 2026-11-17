import { describe, expect, it } from 'vitest';
import { buildTitleCardArgs, buildEndCardArgs, escapeDrawtext } from '../render';

/**
 * The title card is the end card's machinery at a different timestamp (2026-11-17).
 *
 * The escaping is the safety boundary: a product name is creator-supplied and untrusted, so an apostrophe, a percent, a colon or a newline must not break the
 * filter - and the end-card path must not change while this is added.
 */
describe('a title card is composition, not a new render path', () => {
  it('places the escaped text at the requested time', () => {
    const args = buildTitleCardArgs({
      inputPath: 'in.mp4', outputPath: 'out.mp4', text: 'Glow Serum', atSeconds: 2, durationSeconds: 3, width: 1080, height: 1920,
    });
    const filter = args[args.indexOf('-vf') + 1];
    expect(filter).toContain("text='Glow Serum'");
    expect(filter).toContain('between(t,2.00,5.00)');
    expect(args).toContain('in.mp4');
    expect(args[args.length - 1]).toBe('out.mp4');
  });

  it('survives hostile creator-supplied text', () => {
    const hostile = `Bob's 100% Glow: "Best"\nSecond line, trust me`;
    const args = buildTitleCardArgs({
      inputPath: 'in.mp4', outputPath: 'out.mp4', text: hostile, atSeconds: 0, durationSeconds: 2, width: 1080, height: 1920,
    });
    const filter = args[args.indexOf('-vf') + 1];
    // Every metacharacter drawtext treats specially is escaped, and the newline never reaches the filter graph.
    expect(filter).toContain("\\'");
    expect(filter).toContain('\\%');
    expect(filter).toContain('\\:');
    expect(filter).toContain('\\,');
    expect(filter).not.toContain('\n');
    expect(filter).toContain('Second line');
  });

  it('escapeDrawtext covers the five metacharacters', () => {
    expect(escapeDrawtext(`a'b:c%d,e`)).toBe(`a\\'b\\:c\\%d\\,e`);
  });

  it('the end-card path is unchanged (regression)', () => {
    const args = buildEndCardArgs({
      mainPath: 'main.mp4', mainHasAudio: true, mainDurationSeconds: 10, outputPath: 'out.mp4', width: 1080, height: 1920, handle: 'creator',
    });
    expect(args.join(' ')).toContain('Created on Raivstream');
    expect(args.join(' ')).toContain("@creator");
  });
});
