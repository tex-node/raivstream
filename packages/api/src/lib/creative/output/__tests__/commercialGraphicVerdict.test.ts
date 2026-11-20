import { describe, expect, it } from 'vitest';
import { commercialGraphicGateEnabled, commercialGraphicVerdict } from '../graphicPlan';

describe('commercialGraphicVerdict - what publish should do about on-screen text', () => {
  it('passes an ad whose three beats are readable at phone size', () => {
    const { issues, plan } = commercialGraphicVerdict({ hook: 'Still tired by noon?', benefit: 'All-day barrier', cta: 'Shop now', durationSeconds: 9 });
    expect(issues).toEqual([]);
    expect(plan.beats).toHaveLength(3);
  });

  it('blocks an ad whose hook will wrap and clip', () => {
    const { issues } = commercialGraphicVerdict({
      hook: 'This hook is deliberately far too long for a phone screen and will clip',
      benefit: 'All day',
      cta: 'Shop',
      durationSeconds: 9,
    });
    expect(issues.map((issue) => issue.code)).toContain('LINE_TOO_LONG');
    expect(issues[0]!.message).toMatch(/clip|Keep it to/);
  });

  it('is opt-in: the gate is off unless CREATIVE_GRAPHIC_GATE is set', () => {
    expect(commercialGraphicGateEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(commercialGraphicGateEnabled({ CREATIVE_GRAPHIC_GATE: '1' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
