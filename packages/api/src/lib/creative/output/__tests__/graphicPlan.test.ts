import { describe, expect, it } from 'vitest';
import { buildGraphicPlan, graphicIssues, GRAPHIC_MIN_DWELL_SECONDS } from '../graphicPlan';
import { buildGraphicArgs } from '../render';

const frame = { width: 1080, height: 1920 };

describe('buildGraphicPlan', () => {
  it('keeps the contract order: hook, then benefit, then CTA', () => {
    const plan = buildGraphicPlan({ hook: 'Still tired by noon?', benefit: 'Barrier stays intact all day', cta: 'Shop now', durationSeconds: 9 });
    expect(plan.beats.map((b) => b.role)).toEqual(['hook', 'benefit', 'cta']);
    expect(plan.beats.map((b) => b.slot)).toEqual(['top', 'middle', 'lower-third']);
  });

  it('skips empty beats rather than rendering a blank line', () => {
    const plan = buildGraphicPlan({ hook: 'Hook only', benefit: '   ', cta: null, durationSeconds: 6 });
    expect(plan.beats.map((b) => b.role)).toEqual(['hook']);
  });

  it('never allocates a window shorter than the minimum dwell', () => {
    const plan = buildGraphicPlan({ hook: 'A', benefit: 'B', cta: 'C', durationSeconds: 1 });
    // Sub-millisecond rounding from the toFixed(2) windows, hence the tolerance.
    for (const beat of plan.beats) expect(beat.out - beat.in).toBeGreaterThanOrEqual(GRAPHIC_MIN_DWELL_SECONDS - 0.005);
  });
});

describe('graphicIssues - the legibility gate', () => {
  it('passes a plan that is readable', () => {
    const plan = buildGraphicPlan({ hook: 'Still tired by noon?', benefit: 'All-day barrier', cta: 'Shop now', durationSeconds: 9 });
    expect(graphicIssues(plan, { ...frame, durationSeconds: 9 })).toEqual([]);
  });

  it('rejects a line that will wrap and clip', () => {
    const plan = buildGraphicPlan({ hook: 'This line is deliberately far too long for a phone screen', durationSeconds: 6 });
    expect(graphicIssues(plan, { ...frame, durationSeconds: 6 }).map((i) => i.code)).toContain('LINE_TOO_LONG');
  });

  it('rejects a line that is on screen too briefly to read', () => {
    const long = 'A longer line of copy that needs time';
    const plan = { version: 1 as const, style: { box: true, safeArea: 0.08, maxCharsPerLine: 40 }, beats: [{ role: 'hook' as const, text: long, in: 0, out: 1.3, motion: 'fade' as const, slot: 'top' as const }] };
    expect(graphicIssues(plan, { ...frame, durationSeconds: 6 }).map((i) => i.code)).toContain('TOO_BRIEF');
  });

  it('rejects two lines sharing a slot at the same moment', () => {
    const plan = { version: 1 as const, style: { box: true, safeArea: 0.08, maxCharsPerLine: 40 }, beats: [
      { role: 'hook' as const, text: 'First', in: 0, out: 3, motion: 'fade' as const, slot: 'lower-third' as const },
      { role: 'cta' as const, text: 'Second', in: 2, out: 5, motion: 'fade' as const, slot: 'lower-third' as const },
    ] };
    expect(graphicIssues(plan, { ...frame, durationSeconds: 6 }).map((i) => i.code)).toContain('OVERLAP');
  });

  it('says something a creator can act on when there is no text at all', () => {
    const issues = graphicIssues({ version: 1, style: { box: true, safeArea: 0.08, maxCharsPerLine: 32 }, beats: [] }, frame);
    expect(issues[0]!.code).toBe('NO_BEATS');
    expect(issues[0]!.message).toMatch(/hook|benefit|call to action/i);
  });
});
