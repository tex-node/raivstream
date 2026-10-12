/**
 * Phase 2 (R16-02) — R16 scene-style restriction.
 *
 * Write-time enforcement only: R16 (KIDS) may SELECT Cartoon / 3D Animation /
 * Anime; the main app keeps all styles; a stored value outside the R16 set keeps
 * resolving (compatibility read) — reads/generation are never refused.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/promptModeration', () => ({
  moderatePrompt: vi.fn(async () => ({ allowed: true, flagged: false, categories: [], scores: {} })),
  moderationRejectMessage: vi.fn(() => 'rejected'),
  suggestSafeRewrite: vi.fn(async () => null),
}));
vi.mock('../../lib/analytics', () => ({
  analytics: { track: vi.fn(async () => undefined) },
}));

import { storyRouter } from '../story';
import {
  STORY_VISUAL_STYLE_BLOCKS,
  DEFAULT_R16_STORY_VISUAL_STYLE,
  R16_VISUAL_STYLE_KEYS,
  isR16VisualStyle,
  normaliseStoryVisualStyle,
} from '../../lib/storyVisualStyles';

const ALL_STYLES = Object.keys(STORY_VISUAL_STYLE_BLOCKS);

function makeCtx(isR16: boolean) {
  return {
    user: { id: 'u1', role: 'USER' },
    isR16,
    prisma: {
      storyProject: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p1', ...data })),
        findFirst: vi.fn(async () => ({ id: 'p1', userId: 'u1', audienceMode: 'KIDS' })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p1', ...data })),
      },
    },
  };
}

describe('story style constants', () => {
  it('R16 exposes exactly 3 styles and the full set is 10', () => {
    expect([...R16_VISUAL_STYLE_KEYS]).toEqual(['CARTOON', 'THREE_D_ANIMATED', 'ANIME']);
    expect(ALL_STYLES).toHaveLength(10);
    expect(DEFAULT_R16_STORY_VISUAL_STYLE).toBe('CARTOON');
  });
});

describe('createSpark — R16 (KIDS) write restriction', () => {
  for (const style of ['CARTOON', 'ANIME', 'THREE_D_ANIMATED'] as const) {
    it(`accepts ${style}`, async () => {
      const caller = storyRouter.createCaller(makeCtx(true) as never);
      const p = (await caller.createSpark({ idea: 'A gentle little storybook tale', visualStyle: style, audienceMode: 'KIDS' })) as { visualStyle: string };
      expect(p.visualStyle).toBe(style);
    });
  }

  it('rejects a dropped style (STORYBOOK_ILLUSTRATION) on write', async () => {
    const caller = storyRouter.createCaller(makeCtx(true) as never);
    await expect(
      caller.createSpark({ idea: 'A gentle little storybook tale', visualStyle: 'STORYBOOK_ILLUSTRATION', audienceMode: 'KIDS' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('defaults to CARTOON when no style is supplied for an R16 story', async () => {
    const caller = storyRouter.createCaller(makeCtx(true) as never);
    const p = (await caller.createSpark({ idea: 'A gentle little storybook tale', audienceMode: 'KIDS' })) as { visualStyle: string };
    expect(p.visualStyle).toBe('CARTOON');
  });
});

describe('createSpark — main app unaffected', () => {
  for (const style of ALL_STYLES) {
    it(`accepts ${style}`, async () => {
      const caller = storyRouter.createCaller(makeCtx(false) as never);
      const p = (await caller.createSpark({ idea: 'A general audience story', visualStyle: style as never, audienceMode: 'GENERAL' })) as { visualStyle: string };
      expect(p.visualStyle).toBe(style);
    });
  }
});

describe('compatibility read', () => {
  it('a stored dropped style still resolves (no throw) and is simply not R16-selectable', () => {
    expect(normaliseStoryVisualStyle('STORYBOOK_ILLUSTRATION')).toBe('STORYBOOK_ILLUSTRATION');
    expect(isR16VisualStyle('STORYBOOK_ILLUSTRATION')).toBe(false);
    expect(isR16VisualStyle('CARTOON')).toBe(true);
  });
});
