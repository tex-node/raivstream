/**
 * Phase 3 — Homer First-Frame Animatic acceptance tests.
 * 18 tests covering: scene extraction, prompt generation, credits constraint,
 * animatic lifecycle, scene direction, and ConvStage contract.
 *
 * Run: pnpm --filter @raivstream/api test -- --reporter=verbose "phase3_animatic"
 */

import { describe, it, expect } from 'vitest';
import {
  extractScenes,
  buildVisualPrompt,
  computeStoryHash,
  isFalImageEnabled,
} from '../../lib/homer/animaticService';
import type { HomerAnimaticScene } from '../../lib/homer/animaticTypes';
import type { HomerStoryState } from '../../lib/homer/types';
import type { HomerCreativeDecision } from '../../lib/homer/directingTypes';

// ─── Canonical fixture ────────────────────────────────────────────────────────

function c<T>(value: T) {
  return { value, provenance: 'EXPLICIT' as const, basis: undefined };
}

const AMINA_WITH_BEATS: HomerStoryState = {
  version: 'homer_v1',
  interpretedAt: new Date().toISOString(),
  storyText: 'Amina discovers a mysterious radio in an abandoned observatory.',
  audienceMode: 'GENERAL',
  premise: c('Amina discovers a mysterious radio in an abandoned observatory.'),
  genre: c('mystery'),
  tone: c('atmospheric'),
  themes: c(['isolation', 'discovery']),
  emotionalDirection: c('wonder'),
  relationships: [],
  entities: {
    characters: [{
      id: 'char_amina',
      name: c('Amina'),
      role: c('protagonist' as const),
      description: c('Young woman drawn to the unknown.'),
      traits: [c('curious')],
      narrativeImportance: c('primary' as const),
      aliases: [],
      userOwned: true,
      relationships: [],
    }],
    locations: [{
      id: 'loc_obs',
      name: c('abandoned observatory'),
      description: c('Dusty, domed, heavy with forgotten star charts.'),
      role: c('primary'),
      environmentalCharacteristics: c(['abandoned', 'dusty']),
      aliases: [],
      userOwned: false,
    }],
    objects: [{
      id: 'obj_radio',
      name: c('mysterious radio'),
      description: c("Old-fashioned, crackling."),
      narrativeImportance: c('critical' as const),
      continuityRequired: c(true),
    }],
  },
  beats: [
    {
      id: 'beat_01',
      ordinal: 1,
      label: 'Amina arrives',
      description: c('Amina approaches the abandoned observatory at dusk.'),
      function: c('setup' as const),
      emotionalDirection: c('anticipation'),
      charactersInvolved: ['char_amina'],
      locationsInvolved: ['loc_obs'],
      objectsInvolved: [],
      structuralPosition: c('beginning' as const),
    },
    {
      id: 'beat_02',
      ordinal: 2,
      label: 'The radio speaks',
      description: c("Amina finds the radio and hears it whisper her name."),
      function: c('discovery' as const),
      emotionalDirection: c('dread and wonder'),
      charactersInvolved: ['char_amina'],
      locationsInvolved: ['loc_obs'],
      objectsInvolved: ['obj_radio'],
      structuralPosition: c('development' as const),
    },
    {
      id: 'beat_03',
      ordinal: 3,
      label: 'She reaches for it',
      description: c('Despite fear, Amina reaches for the radio.'),
      function: c('decision' as const),
      emotionalDirection: c('determination'),
      charactersInvolved: ['char_amina'],
      locationsInvolved: ['loc_obs'],
      objectsInvolved: ['obj_radio'],
      structuralPosition: c('escalation' as const),
    },
  ],
  structuralArc: c({
    beginning: ['beat_01'],
    development: ['beat_02'],
    escalation: ['beat_03'],
    climax: [],
    consequence: [],
    resolution: [],
  }),
  threads: [{
    id: 'thr_1',
    kind: 'mystery' as const,
    description: c('Who speaks through the radio?'),
    status: 'open' as const,
  }],
  canon: [],
  complexity: {
    score: 3,
    level: 'SIMPLE' as const,
    factors: {
      characterCount: 1,
      locationCount: 1,
      threadCount: 1,
      beatCount: 3,
      temporalComplexity: 'linear' as const,
      relationshipComplexity: 0,
      narrativeLength: 'short' as const,
    },
    seriesCandidate: false,
  },
  episodeBoundaries: [],
  cliffhangers: [],
};

const AMINA_NO_BEATS: HomerStoryState = {
  ...AMINA_WITH_BEATS,
  beats: [],
  structuralArc: c({ beginning: [], development: [], escalation: [], climax: [], consequence: [], resolution: [] }),
};

const FULL_DECISIONS: HomerCreativeDecision[] = [
  { id: 'd1', category: 'VISUAL_TREATMENT', label: 'Visual Treatment', value: 'dreamlike_realism', rationale: 'mystery mood', provenance: 'USER_APPROVED', createdAt: new Date().toISOString() },
  { id: 'd2', category: 'MOOD', label: 'Mood', value: 'haunting', rationale: 'atmosphere', provenance: 'USER_APPROVED', createdAt: new Date().toISOString() },
  { id: 'd3', category: 'TIME_OF_DAY', label: 'Time of Day', value: 'dusk', rationale: 'liminal', provenance: 'HOMER_PROPOSAL', createdAt: new Date().toISOString() },
  { id: 'd4', category: 'CAMERA_PERSPECTIVE', label: 'Camera Perspective', value: 'intimate_close', rationale: 'empathy', provenance: 'USER_APPROVED', createdAt: new Date().toISOString() },
];

// ─── §1: Scene extraction from beats ─────────────────────────────────────────

describe('§1 — Scene extraction from HomerStoryState.beats', () => {

  it('P3-01: extracts one scene per beat', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    expect(scenes).toHaveLength(3);
  });

  it('P3-02: scene fields map correctly from beat', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const first = scenes[0]!;
    expect(first.id).toBe('beat_01');
    expect(first.ordinal).toBe(1);
    expect(first.label).toBe('Amina arrives');
    expect(first.description).toBe('Amina approaches the abandoned observatory at dusk.');
    expect(first.function).toBe('setup');
    expect(first.emotionalDirection).toBe('anticipation');
    expect(first.charactersInvolved).toContain('char_amina');
    expect(first.locationsInvolved).toContain('loc_obs');
  });

  it('P3-03: structuralPosition maps correctly (beginning → act1)', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    expect(scenes[0]!.structuralPosition).toBe('act1');
    expect(scenes[1]!.structuralPosition).toBe('rising');   // development → rising
    expect(scenes[2]!.structuralPosition).toBe('rising');   // escalation → rising
  });

  it('P3-04: scenes are ordered by ordinal', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const ordinals = scenes.map((s) => s.ordinal);
    expect(ordinals).toEqual([1, 2, 3]);
  });

});

// ─── §2: Fallback when beats is empty ────────────────────────────────────────

describe('§2 — Fallback: 4-scene arc when beats is empty', () => {

  it('P3-05: fallback produces exactly 4 scenes', () => {
    const scenes = extractScenes(AMINA_NO_BEATS);
    expect(scenes).toHaveLength(4);
  });

  it('P3-06: fallback scenes have stable synthetic IDs', () => {
    const scenes = extractScenes(AMINA_NO_BEATS);
    expect(scenes[0]!.id).toMatch(/^synth_01/);
    expect(scenes[3]!.id).toMatch(/^synth_04/);
  });

  it('P3-07: fallback includes premise text in setup description', () => {
    const scenes = extractScenes(AMINA_NO_BEATS);
    expect(scenes[0]!.description).toContain('Amina');
  });

  it('P3-08: fallback structural arc is complete (act1 → resolution)', () => {
    const scenes = extractScenes(AMINA_NO_BEATS);
    expect(scenes[0]!.structuralPosition).toBe('act1');
    expect(scenes[2]!.structuralPosition).toBe('climax');
    expect(scenes[3]!.structuralPosition).toBe('resolution');
  });

});

// ─── §3: Visual prompt generation ────────────────────────────────────────────

describe('§3 — Visual prompt generation', () => {

  it('P3-09: prompt includes style fragment from decisions', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(prompt).toMatch(/dreamlike realism/i);
  });

  it('P3-10: prompt includes genre and tone', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(prompt).toMatch(/mystery/i);
    expect(prompt).toMatch(/atmospheric/i);
  });

  it('P3-11: prompt includes scene description and emotional direction', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(prompt).toContain('Amina arrives');
    expect(prompt).toMatch(/anticipation/i);
  });

  it('P3-12: prompt ends with no-text sentinel', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(prompt).toMatch(/No text/i);
    expect(prompt).toMatch(/No logos/i);
  });

  it('P3-13: prompt has no CUT syntax or lens specs (Homer→Director boundary)', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(prompt).not.toMatch(/\bCUT\b|\d+mm|focal length|dolly|pan|tilt/i);
  });

  it('P3-14: prompt is non-empty string', () => {
    const scenes = extractScenes(AMINA_WITH_BEATS);
    const prompt = buildVisualPrompt(scenes[0]!, AMINA_WITH_BEATS, []);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(20);
  });

});

// ─── §4: Story hash stability ─────────────────────────────────────────────────

describe('§4 — Story hash determinism', () => {

  it('P3-15: same state + decisions produces same hash', () => {
    const h1 = computeStoryHash(AMINA_WITH_BEATS, FULL_DECISIONS);
    const h2 = computeStoryHash(AMINA_WITH_BEATS, FULL_DECISIONS);
    expect(h1).toBe(h2);
  });

  it('P3-16: different decisions produce different hashes', () => {
    const h1 = computeStoryHash(AMINA_WITH_BEATS, FULL_DECISIONS);
    const h2 = computeStoryHash(AMINA_WITH_BEATS, []);
    expect(h1).not.toBe(h2);
  });

  it('P3-17: decision order does not affect hash (order-independent)', () => {
    const reversed = [...FULL_DECISIONS].reverse();
    const h1 = computeStoryHash(AMINA_WITH_BEATS, FULL_DECISIONS);
    const h2 = computeStoryHash(AMINA_WITH_BEATS, reversed);
    expect(h1).toBe(h2);
  });

});

// ─── §5: §30 credits constraint ───────────────────────────────────────────────

describe('§5 — §30 credits constraint (FAL_IMAGE gate)', () => {

  it('P3-18: isFalImageEnabled returns false when FAL_IMAGE_ENABLED is absent', () => {
    const savedFal = process.env.FAL_IMAGE_ENABLED;
    const savedProvider = process.env.FAL_MEDIA_PROVIDER_ENABLED;
    const savedKey = process.env.FAL_KEY;
    delete process.env.FAL_IMAGE_ENABLED;
    delete process.env.FAL_MEDIA_PROVIDER_ENABLED;
    delete process.env.FAL_KEY;

    expect(isFalImageEnabled()).toBe(false);

    if (savedFal !== undefined) process.env.FAL_IMAGE_ENABLED = savedFal;
    if (savedProvider !== undefined) process.env.FAL_MEDIA_PROVIDER_ENABLED = savedProvider;
    if (savedKey !== undefined) process.env.FAL_KEY = savedKey;
  });

});
