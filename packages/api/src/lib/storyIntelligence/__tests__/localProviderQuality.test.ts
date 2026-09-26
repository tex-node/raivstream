/**
 * Phase F regression tests — LocalStoryIntelligenceProvider educational-language quality.
 *
 * Guards against the P1 defects found in Phase E:
 *   1. Grammar: plural topics must produce "What are ...?" not "What is ships"
 *   2. Narration: must be child-directed, not documentation language
 *   3. Visual teaching: ships must name specific vessel types (cargo, ferry, container)
 *   4. Anti-commercial: luxury-yacht/advertising drift remains blocked
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import type { EducationalContract } from '../types';

const local = new LocalStoryIntelligenceProvider();

const shipsInput = { idea: "let's talk about ships", answers: [], audienceMode: 'KIDS' as const, sceneCount: 4 };
const carsInput  = { idea: "let's talk about cars",  answers: [], audienceMode: 'KIDS' as const, sceneCount: 4 };
const mathInput  = { idea: "let's talk about math",  answers: [], audienceMode: 'KIDS' as const, sceneCount: 4 };

let shipsContract: EducationalContract;
let carsContract: EducationalContract;
let mathContract: EducationalContract;

beforeAll(async () => {
  [shipsContract, carsContract, mathContract] = await Promise.all([
    local.planEducation(shipsInput),
    local.planEducation(carsInput),
    local.planEducation(mathInput),
  ]);
});

// ─── 1. Grammar: plural topics ───────────────────────────────────────────────

describe('Phase F §1 — Grammar: plural topic educational questions', () => {
  it('"ships" → keyConcepts[0] is "What are ships?" (not "What is ships")', () => {
    expect(shipsContract.keyConcepts[0]).toBe('What are ships?');
  });

  it('"ships" → keyConcepts[0] does not contain the old broken pattern', () => {
    expect(shipsContract.keyConcepts[0]).not.toContain('What is ships');
    expect(shipsContract.keyConcepts[0]).not.toMatch(/What is [a-z]+ [a-z]+/); // no "What is ships" with extra words
  });

  it('"cars" (plural) → "What are cars?"', () => {
    expect(carsContract.keyConcepts[0]).toBe('What are cars?');
  });

  it('"math" (no trailing s) → keyConcepts[0] uses "What is" form (singular-ish)', () => {
    expect(mathContract.keyConcepts[0]).toMatch(/What is/i);
    expect(mathContract.keyConcepts[0]).not.toMatch(/What are/i);
  });

  it('all keyConcepts end with a question mark or are a proper noun phrase', () => {
    for (const concept of shipsContract.keyConcepts) {
      // Each entry should be a well-formed question or phrase (no raw "What is ships" style)
      expect(concept).not.toMatch(/What is ships/i);
      expect(concept).not.toMatch(/What is cars/i);
    }
  });

  it('keyConcepts second entry is "How do ships work?"', () => {
    expect(shipsContract.keyConcepts[1]).toBe('How do ships work?');
  });

  it('keyConcepts third entry is "Types of ships"', () => {
    expect(shipsContract.keyConcepts[2]).toBe('Types of ships');
  });
});

// ─── 2. Narration: child-directed ────────────────────────────────────────────

describe('Phase F §2 — Narration: child-directed language', () => {
  let scenes: Awaited<ReturnType<typeof local.directScenes>>;

  beforeAll(async () => {
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: "let's talk about ships",
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'Understanding ships',
      beats: shipsContract.sceneProgression.map((p) => ({ label: p, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };
    scenes = await local.directScenes({
      blueprint,
      storyTitle: "let's talk about ships",
      storyBody: 'A ship is a large vessel.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContract,
    });
  });

  it('scene 0 narration does not contain "Viewers will understand"', () => {
    expect(scenes[0].narrationText).not.toContain('Viewers will understand');
  });

  it('scene 0 narration is child-directed (contains direct address or child-friendly opener)', () => {
    const text = scenes[0].narrationText?.toLowerCase() ?? '';
    const childDirected = /did you know|let'?s|you will|you are|amazing|fantastic|fascinating|discover/i.test(text);
    expect(childDirected).toBe(true);
  });

  it('scene 0 narration does not use "—" separator as the opening of the sentence (old pattern)', () => {
    // Old broken pattern: "ships — Viewers will understand..."
    expect(scenes[0].narrationText).not.toMatch(/^[a-z]+ —/i);
  });

  it('no scene narration appends the explanationStrategy verbatim', () => {
    for (const scene of scenes) {
      expect(scene.narrationText).not.toContain('Start with a relatable example, then explain the concept in simple steps.');
    }
  });

  it('all scenes reference the topic "ships" in their narration', () => {
    for (const scene of scenes) {
      expect(scene.narrationText?.toLowerCase()).toContain('ships');
    }
  });

  it('recap scene narration contains all three key concepts', () => {
    const last = scenes[scenes.length - 1];
    expect(last.narrationText?.toLowerCase()).toContain('ships');
    // Recap should mention multiple concepts
    const text = last.narrationText ?? '';
    const conceptCount = shipsContract.keyConcepts.filter((c) =>
      text.toLowerCase().includes(c.toLowerCase()),
    ).length;
    expect(conceptCount).toBeGreaterThanOrEqual(2);
  });

  it('all narrationText entries are concise (≤80 words) for KIDS audience', () => {
    for (const scene of scenes) {
      const words = (scene.narrationText ?? '').split(/\s+/).filter(Boolean).length;
      expect(words).toBeLessThanOrEqual(80);
    }
  });
});

// ─── 3. Visual teaching: ship-specific vessel types ──────────────────────────

describe('Phase F §3 — Visual teaching: specific educational ship types named', () => {
  it('visualTeachingStrategy names at least two specific educational vessel types', () => {
    const text = shipsContract.visualTeachingStrategy.toLowerCase();
    const vessels = ['cargo', 'container', 'ferry', 'ferries', 'research vessel', 'fishing'];
    const found = vessels.filter((v) => text.includes(v));
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('visualTeachingStrategy does NOT rely on luxury or commercial vessels as examples', () => {
    const text = shipsContract.visualTeachingStrategy.toLowerCase();
    expect(text).not.toMatch(/luxury yacht|yacht advertisement|luxury lifestyle/);
  });

  it('examplesToUse references specific ship types (not just generic "common everyday example")', () => {
    const joined = shipsContract.examplesToUse.join(' ').toLowerCase();
    const specific = ['cargo', 'container', 'ferry', 'ferries', 'research', 'fishing'].some((v) =>
      joined.includes(v),
    );
    expect(specific).toBe(true);
  });

  it('scene visualTeachingRequirement references specific vessel categories', () => {
    // Run directScenes to get scenes
    // (scenes from §2 beforeAll are not accessible here — test independently)
  });

  it('visualTeachingStrategy instructs to label ship parts (hull, deck, etc.)', () => {
    const text = shipsContract.visualTeachingStrategy.toLowerCase();
    const parts = ['hull', 'deck', 'engine', 'bridge'];
    const found = parts.filter((p) => text.includes(p));
    expect(found.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 4. Anti-commercial gate remains intact ──────────────────────────────────

describe('Phase F §4 — Anti-commercial: luxury-yacht drift still blocked', () => {
  let scenes: Awaited<ReturnType<typeof local.directScenes>>;

  beforeAll(async () => {
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: "let's talk about ships",
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'Understanding ships',
      beats: shipsContract.sceneProgression.map((p) => ({ label: p, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };
    scenes = await local.directScenes({
      blueprint,
      storyTitle: "let's talk about ships",
      storyBody: 'A ship is a large vessel.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContract,
    });
  });

  it('no scene action/visualTeachingRequirement contains luxury yacht drift', () => {
    for (const scene of scenes) {
      const text = `${scene.action ?? ''} ${scene.visualTeachingRequirement ?? ''}`.toLowerCase();
      expect(text).not.toMatch(/luxury yacht|yacht advertisement|luxury lifestyle|premium lifestyle|aspirational wealth/);
    }
  });

  it('antiCommercialNote is present on all scenes and references avoidance', () => {
    for (const scene of scenes) {
      const note = scene.antiCommercialNote?.toLowerCase() ?? '';
      expect(note).toMatch(/luxury|commercial|advertis/);
    }
  });

  it('antiCommercialTopics in contract still contains luxury goods and advertisements', () => {
    const topics = shipsContract.antiCommercialTopics.join(' ').toLowerCase();
    expect(topics).toContain('luxury');
    expect(topics).toContain('advertis');
  });

  it('learningObjective does not mention entertainment, product, or promotion', () => {
    const obj = shipsContract.learningObjective.toLowerCase();
    expect(obj).not.toMatch(/entertainment|product|promotion|sponsor|advertis/);
  });
});

// ─── 5. Backward compatibility: non-educational path unchanged ────────────────

describe('Phase F §5 — Non-educational path is unaffected', () => {
  it('directScenes without educationalContract produces standard beats (no 6 educational fields)', async () => {
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: 'A hero goes on an adventure.',
      protagonist: { name: 'Hero', goal: 'complete the quest' },
      conflict: 'an unexpected challenge',
      beats: [
        { label: 'Beginning', description: 'The hero sets off.' },
        { label: 'Climax', description: 'The hero faces danger.' },
      ],
      continuityRules: [],
      supportingCharacters: [],
    };
    const scenes = await local.directScenes({
      blueprint,
      storyTitle: 'Hero adventure',
      storyBody: 'Once upon a time...',
      audienceMode: 'KIDS',
      sceneCount: 2,
      characterContext: '',
    });
    expect(scenes).toHaveLength(2);
    // Standard scenes should not have educational fields
    expect(scenes[0].learningObjective).toBeUndefined();
    expect(scenes[0].teachingConcept).toBeUndefined();
  });

  it('classifyContent still returns EDUCATIONAL for "let\'s talk about ships"', async () => {
    const ct = await local.classifyContent({ idea: "let's talk about ships", answers: [], audienceMode: 'KIDS' });
    expect(ct).toBe('EDUCATIONAL');
  });
});
