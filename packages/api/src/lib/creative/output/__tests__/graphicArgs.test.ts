import { describe, expect, it } from 'vitest';
import { buildGraphicPlan } from '../graphicPlan';
import { buildGraphicArgs } from '../render';

const frame = { width: 1080, height: 1920 };

describe('buildGraphicArgs', () => {
  const plan = buildGraphicPlan({ hook: `Bob's 100% "Glow"`, benefit: 'All day', cta: 'Shop, now', durationSeconds: 9 });
  const filter = () => buildGraphicArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', plan, ...frame })[4]!;

  it('escapes every comma inside an option value, so ffmpeg cannot read 2.00 as a filter name', () => {
    const f = filter();
    // Every `between(` must be followed by an escaped comma, never a bare one.
    expect(f).toMatch(/between\(t\\,/);
    expect(f).not.toMatch(/between\(t,/);
    expect(f).toMatch(/alpha='min\(1\\,max\(0\\,/);
  });

  it('escapes quotes and commas inside creator-supplied text', () => {
    const f = filter();
    expect(f).toMatch(/\\"Glow\\"/);
    expect(f).toMatch(/Shop\\, now/);
  });

  it('emits one drawtext per beat, so the plan is the whole overlay', () => {
    expect(filter().match(/drawtext=/g)).toHaveLength(plan.beats.length);
  });
});
