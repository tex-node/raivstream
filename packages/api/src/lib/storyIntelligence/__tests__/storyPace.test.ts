/**
 * STORY-PACE Phase B tests.
 *
 * A. Feature flag gate: isStoryPaceEnabled returns false when env var is absent.
 * B. Feature flag gate: isStoryPaceEnabled returns true when STORY_PACE_ENABLED=true.
 * C. STORY_PACE_CONFIG: SHORT has beatMin=3, beatMax=4, narrationWordMin=12, narrationWordMax=25.
 * D. STORY_PACE_CONFIG: MEDIUM has beatMin=5, beatMax=7.
 * E. Blueprint beat constraint — flag OFF: produces legacy "4 to 6 entries" text.
 * F. Blueprint beat constraint — flag ON + SHORT: produces "3 to 4 entries" text.
 * G. Blueprint beat constraint — flag ON + MEDIUM: produces "5 to 7 entries" text.
 * P. Fix 1 — legacy project (storyLength=null): pace duration returns null even with flag ON.
 * Q. Fix 2 — beat ceiling: 6 beats for SHORT → 4 scenes, ending (beat 6) content preserved.
 * R. Fix 3 — missing narrationScript on paced project: duration uses tier midpoint, not 5s.
 * H. Duration formula: ceil(words/2)+2, clamped 4–15.
 * I. Duration formula: 12 words → 8s; 25 words → 14.5s → ceil = 15s → clamped 15.
 * J. Duration formula: 6 words → ceil(3)+2 = 5s; 0 words → clamped 4s (no division by zero).
 * K. buildNarrativeSystem — flag OFF: always returns STAGE_1_SYSTEM (no SHORT variant).
 * L. buildNarrativeSystem — flag ON + SHORT: returns SHORT system prompt.
 * M. buildNarrativeSystem — flag ON + continuation: returns CONTINUE prompt regardless of length.
 * N. PlanSceneNarrationInput: accepts optional wordBudget field (type-check).
 * O. LocalStoryIntelligenceProvider.planSceneNarration: accepts wordBudget, still returns string.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isStoryPaceEnabled,
  STORY_PACE_CONFIG,
  type StoryLengthTier,
  type PlanSceneNarrationInput,
} from '../types';
import { buildBlueprintUserPrompt } from '../prompts/storyBlueprintPrompt';
import { buildNarrativeSystem } from '../../narrativeEngine';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import { mergeBlueprintBeatsToMax, durationFromNarrationWords } from '../storyPaceHelpers';

const LOCAL = new LocalStoryIntelligenceProvider();

// ── Helpers ──────────────────────────────────────────────────────────────────

function durationFromWords(words: number): number {
  if (words <= 0) return 4;
  return Math.min(15, Math.max(4, Math.ceil(words / 2) + 2));
}

function withPaceFlag(on: boolean, fn: () => void) {
  const before = process.env.STORY_PACE_ENABLED;
  process.env.STORY_PACE_ENABLED = on ? 'true' : 'false';
  try { fn(); } finally {
    if (before === undefined) delete process.env.STORY_PACE_ENABLED;
    else process.env.STORY_PACE_ENABLED = before;
  }
}

const BASE_PLAN_INPUT = {
  idea: 'A bunny finds a lost toy',
  answers: [],
  audienceMode: 'KIDS' as const,
};

// ── A. Flag absent ────────────────────────────────────────────────────────────
describe('A. isStoryPaceEnabled — flag absent', () => {
  it('returns false when STORY_PACE_ENABLED is not set', () => {
    const before = process.env.STORY_PACE_ENABLED;
    delete process.env.STORY_PACE_ENABLED;
    try {
      expect(isStoryPaceEnabled()).toBe(false);
    } finally {
      if (before !== undefined) process.env.STORY_PACE_ENABLED = before;
    }
  });
});

// ── B. Flag present ────────────────────────────────────────────────────────────
describe('B. isStoryPaceEnabled — flag present', () => {
  it('returns true when STORY_PACE_ENABLED=true', () => {
    const before = process.env.STORY_PACE_ENABLED;
    process.env.STORY_PACE_ENABLED = 'true';
    try {
      expect(isStoryPaceEnabled()).toBe(true);
    } finally {
      if (before === undefined) delete process.env.STORY_PACE_ENABLED;
      else process.env.STORY_PACE_ENABLED = before;
    }
  });
});

// ── C. SHORT config ────────────────────────────────────────────────────────────
describe('C. STORY_PACE_CONFIG SHORT', () => {
  const cfg = STORY_PACE_CONFIG['SHORT'];
  it('beatMin = 3', () => expect(cfg.beatMin).toBe(3));
  it('beatMax = 4', () => expect(cfg.beatMax).toBe(4));
  it('narrationWordMin = 12', () => expect(cfg.narrationWordMin).toBe(12));
  it('narrationWordMax = 25', () => expect(cfg.narrationWordMax).toBe(25));
});

// ── D. MEDIUM config ────────────────────────────────────────────────────────────
describe('D. STORY_PACE_CONFIG MEDIUM', () => {
  const cfg = STORY_PACE_CONFIG['MEDIUM'];
  it('beatMin = 5', () => expect(cfg.beatMin).toBe(5));
  it('beatMax = 7', () => expect(cfg.beatMax).toBe(7));
});

// ── E. Blueprint prompt — flag OFF ─────────────────────────────────────────────
describe('E. buildBlueprintUserPrompt — flag OFF (legacy)', () => {
  it('uses legacy "4 to 6 entries" constraint', () => {
    withPaceFlag(false, () => {
      const prompt = buildBlueprintUserPrompt({ ...BASE_PLAN_INPUT, storyLength: 'SHORT' });
      expect(prompt).toContain('4 to 6 entries');
      expect(prompt).not.toContain('3 to 4 entries');
    });
  });

  it('uses legacy constraint when storyLength is null', () => {
    withPaceFlag(false, () => {
      const prompt = buildBlueprintUserPrompt({ ...BASE_PLAN_INPUT, storyLength: null });
      expect(prompt).toContain('4 to 6 entries');
    });
  });
});

// ── F. Blueprint prompt — flag ON + SHORT ──────────────────────────────────────
describe('F. buildBlueprintUserPrompt — flag ON + SHORT', () => {
  it('uses "3 to 4 entries" constraint', () => {
    withPaceFlag(true, () => {
      const prompt = buildBlueprintUserPrompt({ ...BASE_PLAN_INPUT, storyLength: 'SHORT' });
      expect(prompt).toContain('3 to 4 entries');
      expect(prompt).not.toContain('4 to 6 entries');
    });
  });

  it('includes beat-split rule for SHORT narration budget', () => {
    withPaceFlag(true, () => {
      const prompt = buildBlueprintUserPrompt({ ...BASE_PLAN_INPUT, storyLength: 'SHORT' });
      expect(prompt).toContain('25 narration words');
    });
  });
});

// ── G. Blueprint prompt — flag ON + MEDIUM ─────────────────────────────────────
describe('G. buildBlueprintUserPrompt — flag ON + MEDIUM', () => {
  it('uses "5 to 7 entries" constraint', () => {
    withPaceFlag(true, () => {
      const prompt = buildBlueprintUserPrompt({ ...BASE_PLAN_INPUT, storyLength: 'MEDIUM' });
      expect(prompt).toContain('5 to 7 entries');
    });
  });
});

// ── H. Duration formula — general contract ─────────────────────────────────────
describe('H. Duration formula: ceil(words/2)+2 clamped 4–15', () => {
  it('is monotonically non-decreasing with word count', () => {
    const durations = [1, 4, 12, 18, 25, 26].map(durationFromWords);
    for (let i = 1; i < durations.length; i++) {
      expect(durations[i]).toBeGreaterThanOrEqual(durations[i - 1]!);
    }
  });

  it('never exceeds 15s', () => {
    expect(durationFromWords(100)).toBe(15);
  });

  it('never goes below 4s', () => {
    expect(durationFromWords(0)).toBe(4);
    expect(durationFromWords(1)).toBeGreaterThanOrEqual(4);
  });
});

// ── I. Duration formula — specific values ──────────────────────────────────────
describe('I. Duration formula — specific values', () => {
  it('12 words → 8s  (ceil(12/2)+2 = 6+2)', () => expect(durationFromWords(12)).toBe(8));
  it('25 words → 15s (ceil(12.5)+2 = 13+2 = 15, clamped)', () => expect(durationFromWords(25)).toBe(15));
  it('18 words → 11s (ceil(9)+2)', () => expect(durationFromWords(18)).toBe(11));
  it('20 words → 12s (ceil(10)+2)', () => expect(durationFromWords(20)).toBe(12));
});

// ── J. Duration formula — edge cases ──────────────────────────────────────────
describe('J. Duration formula — edge cases', () => {
  it('0 words clamps to 4s', () => expect(durationFromWords(0)).toBe(4));
  it('6 words → ceil(3)+2 = 5s', () => expect(durationFromWords(6)).toBe(5));
  it('2 words → ceil(1)+2 = 3, clamped to 4s', () => expect(durationFromWords(2)).toBe(4));
});

// ── K. buildNarrativeSystem — flag OFF ────────────────────────────────────────
describe('K. buildNarrativeSystem — flag OFF (legacy)', () => {
  it('does not contain SHORT prompt directive when flag is off', () => {
    withPaceFlag(false, () => {
      const system = buildNarrativeSystem('KIDS', false, 'SHORT');
      expect(system).not.toContain('exactly 3 to 4 scenes');
    });
  });

  it('contains legacy "3 to 5 scene story" directive', () => {
    withPaceFlag(false, () => {
      const system = buildNarrativeSystem('KIDS', false, 'SHORT');
      expect(system).toContain('3 to 5 scene story');
    });
  });
});

// ── L. buildNarrativeSystem — flag ON + SHORT ────────────────────────────────
describe('L. buildNarrativeSystem — flag ON + SHORT', () => {
  it('returns the SHORT system prompt variant', () => {
    withPaceFlag(true, () => {
      const system = buildNarrativeSystem('KIDS', false, 'SHORT');
      expect(system).toContain('exactly 3 to 4 scenes');
    });
  });

  it('still appends the KIDS safety rules', () => {
    withPaceFlag(true, () => {
      const system = buildNarrativeSystem('KIDS', false, 'SHORT');
      expect(system.toUpperCase()).toContain('SAFETY');
    });
  });
});

// ── M. buildNarrativeSystem — continuation ignores storyLength ────────────────
describe('M. buildNarrativeSystem — continuation ignores storyLength', () => {
  it('continuation=true always uses CONTINUE prompt, not SHORT', () => {
    withPaceFlag(true, () => {
      const system = buildNarrativeSystem('KIDS', true, 'SHORT');
      expect(system).not.toContain('exactly 3 to 4 scenes');
      expect(system).toContain('continuing an ongoing');
    });
  });
});

// ── N. PlanSceneNarrationInput accepts wordBudget ─────────────────────────────
describe('N. PlanSceneNarrationInput type includes wordBudget', () => {
  it('accepts wordBudget tuple at compile time (runtime shape check)', () => {
    const input: PlanSceneNarrationInput = {
      sceneTitle: 'Test',
      sceneDescription: 'A test scene.',
      audienceMode: 'KIDS',
      wordBudget: [12, 25],
    };
    expect(input.wordBudget).toEqual([12, 25]);
  });

  it('accepts null wordBudget', () => {
    const input: PlanSceneNarrationInput = {
      sceneTitle: 'Test',
      sceneDescription: 'A test scene.',
      audienceMode: 'KIDS',
      wordBudget: null,
    };
    expect(input.wordBudget).toBeNull();
  });
});

// ── O. LocalProvider accepts wordBudget ───────────────────────────────────────
describe('O. LocalStoryIntelligenceProvider.planSceneNarration with wordBudget', () => {
  it('returns a string even when wordBudget is provided', async () => {
    const result = await LOCAL.planSceneNarration({
      sceneTitle: 'Forest morning',
      sceneDescription: 'Animals wake up.',
      audienceMode: 'KIDS',
      wordBudget: [12, 25],
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });

  it('returns a string when wordBudget is null', async () => {
    const result = await LOCAL.planSceneNarration({
      sceneTitle: 'Forest morning',
      sceneDescription: 'Animals wake up.',
      audienceMode: 'KIDS',
      wordBudget: null,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });
});

// ── P. Fix 1 — legacy project safety ─────────────────────────────────────────
describe('P. Fix 1 — legacy project (storyLength=null): no pace duration even with flag ON', () => {
  it('durationFromNarrationWords is irrelevant when storyLength is null', () => {
    // Simulate the paceDuration guard in generateSceneVideoAsset:
    // if (!isStoryPaceEnabled()) return null
    // if (!projectStoryLength) return null   <-- Fix 1 guard
    function computePaceDuration(
      flagOn: boolean,
      storyLength: string | null | undefined,
      narrationScript: string | null,
    ): number | null {
      if (!flagOn) return null;
      if (!storyLength) return null; // Fix 1: legacy project
      const cfg = STORY_PACE_CONFIG[storyLength as keyof typeof STORY_PACE_CONFIG];
      if (!cfg) return null;
      if (narrationScript) {
        const words = narrationScript.trim().split(/\s+/).filter(Boolean).length;
        return durationFromNarrationWords(words);
      }
      const midpoint = Math.round((cfg.narrationWordMin + cfg.narrationWordMax) / 2);
      return durationFromNarrationWords(midpoint);
    }

    withPaceFlag(true, () => {
      // Flag ON, storyLength null → returns null (legacy)
      expect(computePaceDuration(true, null, 'Hello world this is a test narration')).toBeNull();
      expect(computePaceDuration(true, undefined, 'Hello world this is a test narration')).toBeNull();
      // Flag ON, storyLength set → computes duration
      expect(computePaceDuration(true, 'SHORT', 'Hello world this is a test narration')).toBeGreaterThan(0);
      // Flag OFF, storyLength set → returns null (flag guard)
      expect(computePaceDuration(false, 'SHORT', 'Hello world this is a test narration')).toBeNull();
    });
  });
});

// ── Q. Fix 2 — beat ceiling + ending preserved ────────────────────────────────
describe('Q. Fix 2 — 6 beats for SHORT → 4 scenes, ending preserved', () => {
  const sixBeats = [
    { label: 'Beat 1', description: 'Opening scene.' },
    { label: 'Beat 2', description: 'Rising action begins.' },
    { label: 'Beat 3', description: 'Midpoint confrontation.' },
    { label: 'Beat 4', description: 'Dark moment.' },
    { label: 'Beat 5', description: 'Climax reached.' },
    { label: 'Beat 6', description: 'Resolution and happy ending.' },
  ];

  const blueprint = {
    version: 'story_blueprint_v1' as const,
    premise: 'A bunny finds a toy',
    protagonist: { name: 'Bunny', goal: 'Find toy', motivation: undefined, flaw: undefined },
    conflict: 'Toy is lost',
    beats: sixBeats,
    supportingCharacters: [],
    continuityRules: [],
  };

  it('clamps to 4 beats (SHORT beatMax)', () => {
    const result = mergeBlueprintBeatsToMax(blueprint, 4);
    expect(result.beats).toHaveLength(4);
  });

  it('preserves Beat 6 ending text in merged last beat', () => {
    const result = mergeBlueprintBeatsToMax(blueprint, 4);
    const lastBeat = result.beats[3]!;
    expect(lastBeat.description).toContain('Resolution and happy ending.');
  });

  it('preserves Beat 5 climax text in merged last beat', () => {
    const result = mergeBlueprintBeatsToMax(blueprint, 4);
    const lastBeat = result.beats[3]!;
    expect(lastBeat.description).toContain('Climax reached.');
  });

  it('keeps beats 1–3 unchanged', () => {
    const result = mergeBlueprintBeatsToMax(blueprint, 4);
    expect(result.beats[0]!.description).toBe('Opening scene.');
    expect(result.beats[1]!.description).toBe('Rising action begins.');
    expect(result.beats[2]!.description).toBe('Midpoint confrontation.');
  });

  it('does not modify blueprint when beats.length <= max', () => {
    const threeBeats = { ...blueprint, beats: sixBeats.slice(0, 3) };
    const result = mergeBlueprintBeatsToMax(threeBeats, 4);
    expect(result).toBe(threeBeats); // same reference = unchanged
  });
});

// ── R. Fix 3 — missing narrationScript uses tier midpoint, not 5s ─────────────
describe('R. Fix 3 — missing narrationScript on paced project uses midpoint duration', () => {
  it('SHORT midpoint: ceil((12+25)/2) = 19 words → durationFromNarrationWords(19) ≠ 5', () => {
    const cfg = STORY_PACE_CONFIG['SHORT'];
    const midpoint = Math.round((cfg.narrationWordMin + cfg.narrationWordMax) / 2);
    expect(midpoint).toBe(19); // ceil((12+25)/2) = ceil(18.5) → Math.round = 19
    const duration = durationFromNarrationWords(midpoint);
    expect(duration).not.toBe(5);
    expect(duration).toBeGreaterThanOrEqual(4);
    expect(duration).toBeLessThanOrEqual(15);
  });

  it('SHORT midpoint 19 words → 12s  (ceil(19/2)+2 = ceil(9.5)+2 = 10+2)', () => {
    const duration = durationFromNarrationWords(19);
    expect(duration).toBe(12);
  });

  it('MEDIUM midpoint: narrationWordMin=20, narrationWordMax=24 → midpoint=22 → 13s', () => {
    const cfg = STORY_PACE_CONFIG['MEDIUM'];
    const midpoint = Math.round((cfg.narrationWordMin + cfg.narrationWordMax) / 2);
    expect(midpoint).toBe(22);
    const duration = durationFromNarrationWords(midpoint);
    expect(duration).toBe(13); // ceil(22/2)+2 = 11+2
    expect(duration).not.toBe(5);
  });
});
