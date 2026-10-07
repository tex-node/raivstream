/**
 * Homer Directing — Phase 2 Acceptance Tests.
 *
 * Tests 1–9:  selectNextDirectingQuestion (deterministic engine)
 * Tests 10–13: proposeDirectingDecision (rule-based proposal)
 * Tests 14–15: tRPC endpoint existence
 */

import { describe, it, expect } from 'vitest';
import { selectNextDirectingQuestion, proposeDirectingDecision } from '../../lib/homer/directing';
import { creativeHomerRouter } from '../creative/homer';
import type { HomerStoryState } from '../../lib/homer/types';
import type { HomerCreativeDecision } from '../../lib/homer/directingTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function claim<T>(value: T) {
  return { value, provenance: 'EXPLICIT' as const, basis: undefined };
}

function makeState(overrides: Partial<HomerStoryState> = {}): HomerStoryState {
  return {
    version: 'homer_v1',
    premise: claim('Amina enters an abandoned observatory and finds a radio that whispers her name.'),
    genre: claim('mystery'),
    tone: claim('atmospheric'),
    themes: claim(['isolation', 'memory']),
    emotionalDirection: claim('bittersweet'),
    entities: {
      characters: [
        {
          id: 'char_amina',
          name: claim('Amina'),
          role: claim('protagonist'),
          arc: claim('seeks truth'),
          aliases: [],
          userOwned: true,
          relationships: [],
        },
      ],
      locations: [
        {
          id: 'loc_obs',
          name: claim('abandoned observatory'),
          description: claim('Dusty, silent, heavy with old light.'),
          role: claim('primary'),
          environmentalCharacteristics: claim(['abandoned', 'dusty', 'quiet']),
          aliases: [],
          userOwned: false,
        },
      ],
      objects: [
        {
          id: 'obj_radio',
          name: claim('old radio'),
          description: claim('Whispers when no signal should exist.'),
          narrativeImportance: claim('critical' as const),
          continuityRequired: claim(true),
        },
      ],
    },
    threads: [
      {
        id: 'thr_1',
        kind: 'mystery' as const,
        description: claim('Who is speaking through the radio?'),
        status: 'open' as const,
      },
    ],
    beats: [],
    canon: [],
    complexity: {
      score: 3,
      level: 'SIMPLE' as const,
      factors: { characterCount: 1, locationCount: 1, threadCount: 1, beatCount: 0, temporalComplexity: 'linear' as const, relationshipComplexity: 0, narrativeLength: 'short' as const },
      seriesCandidate: false,
    },
    cliffhangers: [],
    ...overrides,
  } as HomerStoryState;
}

function makeDecision(category: HomerCreativeDecision['category'], value: string): HomerCreativeDecision {
  return {
    id: `dir_test_${category}`,
    category,
    label: category,
    value,
    rationale: 'test',
    provenance: 'USER_APPROVED',
    createdAt: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('selectNextDirectingQuestion', () => {
  it('Test 1 — returns VISUAL_TREATMENT as first question for an empty directing session', () => {
    const state = makeState();
    const result = selectNextDirectingQuestion(state, []);
    expect(result.isComplete).toBe(false);
    expect(result.question).not.toBeNull();
    expect(result.question?.category).toBe('VISUAL_TREATMENT');
    expect(result.question?.choices.length).toBeGreaterThan(0);
  });

  it('Test 2 — skips decided categories and returns the next unanswered one', () => {
    const state = makeState();
    const existing: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'dreamlike_realism'),
      makeDecision('MOOD', 'quietly_unsettling'),
    ];
    const result = selectNextDirectingQuestion(state, existing);
    expect(result.isComplete).toBe(false);
    // WORLD_TREATMENT should not be inferred for mystery genre — should ask
    expect(result.question?.category).toBe('WORLD_TREATMENT');
  });

  it('Test 3 — infers MOOD from horror genre and proceeds to the next unknown', () => {
    const state = makeState({ genre: claim('horror') });
    const result = selectNextDirectingQuestion(state, [
      makeDecision('VISUAL_TREATMENT', 'heightened_contrast'),
    ]);
    // MOOD should be inferred (horror → quietly_unsettling)
    expect(result.inferred.some((d) => d.category === 'MOOD')).toBe(true);
    const inferredMood = result.inferred.find((d) => d.category === 'MOOD');
    expect(inferredMood?.value).toBe('quietly_unsettling');
    expect(inferredMood?.provenance).toBe('HOMER_INFERENCE');
    // Next question should NOT be MOOD
    expect(result.question?.category).not.toBe('MOOD');
  });

  it('Test 4 — infers CHARACTER_PRESENTATION as not_applicable when no characters exist', () => {
    const state = makeState({
      entities: { characters: [], locations: [], objects: [] },
    });
    // Resolve all earlier categories first
    const existing: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'naturalistic'),
      makeDecision('MOOD', 'warm_intimate'),
      makeDecision('WORLD_TREATMENT', 'grounded'),
      makeDecision('CAMERA_PERSPECTIVE', 'observational'),
    ];
    const result = selectNextDirectingQuestion(state, existing);
    // CHARACTER_PRESENTATION should be auto-inferred as not_applicable
    const charInfer = result.inferred.find((d) => d.category === 'CHARACTER_PRESENTATION');
    expect(charInfer).toBeDefined();
    expect(charInfer?.value).toBe('not_applicable');
    expect(charInfer?.provenance).toBe('HOMER_INFERENCE');
  });

  it('Test 5 — infers PACING as measured for a SIMPLE story', () => {
    const state = makeState({ complexity: { score: 2, level: 'SIMPLE' as const, factors: { characterCount: 1, locationCount: 1, threadCount: 1, beatCount: 0, temporalComplexity: 'linear' as const, relationshipComplexity: 0, narrativeLength: 'short' as const }, seriesCandidate: false } });
    const existing: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'dreamlike_realism'),
      makeDecision('MOOD', 'melancholic'),
      makeDecision('WORLD_TREATMENT', 'grounded'),
      makeDecision('CAMERA_PERSPECTIVE', 'close_intimate'),
      makeDecision('CHARACTER_PRESENTATION', 'revealed_slowly'),
      makeDecision('TIME_OF_DAY', 'night_dusk'),
    ];
    const result = selectNextDirectingQuestion(state, existing);
    // PACING should be inferred for SIMPLE story
    const inferredPacing = result.inferred.find((d) => d.category === 'PACING');
    expect(inferredPacing?.value).toBe('measured');
    expect(inferredPacing?.provenance).toBe('HOMER_INFERENCE');
    expect(result.isComplete).toBe(true);
  });

  it('Test 6 — returns isComplete when all categories are resolved', () => {
    const state = makeState();
    const allDecided: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'dreamlike_realism'),
      makeDecision('MOOD', 'quietly_unsettling'),
      makeDecision('WORLD_TREATMENT', 'grounded'),
      makeDecision('CAMERA_PERSPECTIVE', 'close_intimate'),
      makeDecision('CHARACTER_PRESENTATION', 'revealed_slowly'),
      makeDecision('TIME_OF_DAY', 'night_dusk'),
      makeDecision('PACING', 'measured'),
    ];
    const result = selectNextDirectingQuestion(state, allDecided);
    expect(result.isComplete).toBe(true);
    expect(result.question).toBeNull();
  });

  it('Test 7 — includes inferred decisions in the inferred array alongside the question', () => {
    const state = makeState({ genre: claim('romance') });
    // Only VISUAL_TREATMENT decided
    const result = selectNextDirectingQuestion(state, [
      makeDecision('VISUAL_TREATMENT', 'dreamlike_realism'),
    ]);
    // MOOD should be inferred (romance → warm_intimate)
    expect(result.inferred.length).toBeGreaterThan(0);
    // totalDecisions accounts for inferred
    expect(result.totalDecisions).toBeGreaterThan(1);
  });

  it('Test 8 — infers CHARACTER_PRESENTATION as immediately_present in KIDS mode', () => {
    const state = makeState();
    const existing: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'naturalistic'),
      makeDecision('MOOD', 'warm_intimate'),
      makeDecision('WORLD_TREATMENT', 'grounded'),
      makeDecision('CAMERA_PERSPECTIVE', 'observational'),
    ];
    const result = selectNextDirectingQuestion(state, existing, 'KIDS');
    const charInfer = result.inferred.find((d) => d.category === 'CHARACTER_PRESENTATION');
    expect(charInfer?.value).toBe('immediately_present');
  });

  it('Test 9 — infers TIME_OF_DAY=night_dusk for mystery genre', () => {
    const state = makeState({ genre: claim('mystery') });
    const existing: HomerCreativeDecision[] = [
      makeDecision('VISUAL_TREATMENT', 'heightened_contrast'),
      makeDecision('MOOD', 'quietly_unsettling'),
      makeDecision('WORLD_TREATMENT', 'grounded'),
      makeDecision('CAMERA_PERSPECTIVE', 'character_subjective'),
      makeDecision('CHARACTER_PRESENTATION', 'enigmatic'),
    ];
    const result = selectNextDirectingQuestion(state, existing);
    const timeInfer = result.inferred.find((d) => d.category === 'TIME_OF_DAY');
    expect(timeInfer?.value).toBe('night_dusk');
  });
});

describe('proposeDirectingDecision', () => {
  it('Test 10 — returns HOMER_PROPOSAL provenance', () => {
    const state = makeState();
    const decision = proposeDirectingDecision('VISUAL_TREATMENT', state, []);
    expect(decision.provenance).toBe('HOMER_PROPOSAL');
    expect(decision.id).toMatch(/^dir_/);
    expect(decision.category).toBe('VISUAL_TREATMENT');
    expect(typeof decision.value).toBe('string');
    expect(decision.value.length).toBeGreaterThan(0);
    expect(typeof decision.rationale).toBe('string');
  });

  it('Test 11 — proposes heightened_contrast for horror VISUAL_TREATMENT', () => {
    const state = makeState({ genre: claim('horror') });
    const decision = proposeDirectingDecision('VISUAL_TREATMENT', state, []);
    expect(decision.value).toBe('heightened_contrast');
  });

  it('Test 12 — uses existing VISUAL_TREATMENT=naturalistic to propose observational camera', () => {
    const state = makeState();
    const existing: HomerCreativeDecision[] = [makeDecision('VISUAL_TREATMENT', 'naturalistic')];
    const decision = proposeDirectingDecision('CAMERA_PERSPECTIVE', state, existing);
    expect(decision.value).toBe('observational');
  });

  it('Test 13 — proposes measured pacing for a SIMPLE story', () => {
    const state = makeState({
      complexity: { score: 2, level: 'SIMPLE' as const, factors: { characterCount: 1, locationCount: 1, threadCount: 1, beatCount: 0, temporalComplexity: 'linear' as const, relationshipComplexity: 0, narrativeLength: 'short' as const }, seriesCandidate: false },
    });
    const decision = proposeDirectingDecision('PACING', state, []);
    expect(decision.value).toBe('measured');
  });
});

describe('creativeHomerRouter directing endpoints', () => {
  it('Test 14 — nextDirectingQuestion is defined on creativeHomerRouter', () => {
    expect(creativeHomerRouter.nextDirectingQuestion).toBeDefined();
  });

  it('Test 15 — proposeDecision is defined on creativeHomerRouter', () => {
    expect(creativeHomerRouter.proposeDecision).toBeDefined();
  });
});
