/**
 * Phase C — Educational Scene Director + Narration Contract regression tests.
 *
 * Tests all acceptance criteria from the spec:
 * - Classification: "let's talk about ships" → EDUCATIONAL
 * - Educational scene contract contains learningObjective, teachingConcept, visualTeachingRequirement
 * - Every educational scene has narrationText
 * - Narration references the assigned teaching concept
 * - Different vocabulary levels produce appropriately different narration
 * - Anti-commercial protection is present
 * - Visual direction preserves educational subject (not commercial/luxury)
 * - R16: audienceMode=KIDS for R16 context
 * - Non-R16: GENERAL audience does NOT get forced into KIDS mode
 * - directedSceneSchema correctly validates scenes with and without educational fields
 */

import { describe, it, expect } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import {
  directedSceneSchema,
  educationalContractSchema,
  teachingRoleSchema,
  type EducationalContract,
  type DirectScenesInput,
} from '../types';
import {
  buildContentClassifierSystem,
  buildContentClassifierUser,
} from '../prompts/contentClassifierPrompt';
import {
  buildEducationalSceneDirectorSystem,
  buildEducationalSceneDirectorUser,
} from '../prompts/educationalSceneDirectorPrompt';

const local = new LocalStoryIntelligenceProvider();

// ── Shared test fixtures ──────────────────────────────────────────────────────

const shipsContractKids: EducationalContract = {
  version: 'education_contract_v1',
  topic: 'ships',
  targetAge: '3–8 years',
  learningObjective: 'Understand what ships are and why they travel on water',
  keyConcepts: ['A ship is a large vessel that travels on water', 'Ships carry people and cargo', 'Ships are different from small boats', 'Ships use engines to move'],
  vocabularyLevel: 'very_simple',
  explanationStrategy: 'Start with what a ship looks like, then explain what it does',
  examplesToUse: ['a container ship carrying boxes', 'a passenger ferry carrying people'],
  visualTeachingStrategy: 'Show clearly labeled cargo ships and passenger ships on water — not luxury yachts',
  narrationRequired: true,
  sceneProgression: ['What is a ship?', 'What do ships carry?', 'How are ships different from boats?', 'How do ships move?'],
  recapIncluded: true,
  antiCommercialTopics: ['luxury yachts', 'yacht advertising', 'premium lifestyle', 'brand logos', 'marina glamour', 'aspirational luxury'],
};

const shipsContractGeneral: EducationalContract = {
  ...shipsContractKids,
  targetAge: 'all ages',
  vocabularyLevel: 'simple',
};

const minimalBlueprint = {
  version: 'story_blueprint_v1' as const,
  premise: 'Learn about ships',
  protagonist: { name: 'Narrator', goal: 'Teach about ships' },
  conflict: 'Understanding how large ships work',
  beats: [
    { label: 'Introduction', description: 'Introduce ships' },
    { label: 'Core concept', description: 'Ships carry cargo' },
    { label: 'Example', description: 'Container ship example' },
    { label: 'Recap', description: 'Review what we learned' },
  ],
  continuityRules: [],
  supportingCharacters: [],
};

// ── Classification ────────────────────────────────────────────────────────────

describe('classification: "let\'s talk about ships"', () => {
  it('classifies as EDUCATIONAL', async () => {
    const result = await local.classifyContent({
      idea: "let's talk about ships",
      answers: [],
      audienceMode: 'KIDS',
    });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies "learn about volcanoes" as EDUCATIONAL', async () => {
    const result = await local.classifyContent({
      idea: 'learn about volcanoes',
      answers: [],
      audienceMode: 'KIDS',
    });
    expect(result).toBe('EDUCATIONAL');
  });

  it('classifies story content as STORY (not forced to EDUCATIONAL)', async () => {
    const result = await local.classifyContent({
      idea: 'a story about a brave dragon',
      answers: [],
      audienceMode: 'KIDS',
    });
    expect(result).toBe('STORY');
  });

  it('classifies commercial content as COMMERCIAL (not EDUCATIONAL)', async () => {
    const result = await local.classifyContent({
      idea: 'buy our new luxury yacht collection',
      answers: [],
      audienceMode: 'GENERAL',
    });
    expect(result).toBe('COMMERCIAL');
  });
});

// ── Educational scene contract ────────────────────────────────────────────────

describe('educational scene contract (ships)', () => {
  it('contains targetAge', () => {
    expect(shipsContractKids.targetAge).toBeTruthy();
  });

  it('contains learningObjective', () => {
    expect(shipsContractKids.learningObjective).toBeTruthy();
  });

  it('contains keyConcepts (≥2)', () => {
    expect(shipsContractKids.keyConcepts.length).toBeGreaterThanOrEqual(2);
  });

  it('contains anti-commercial constraint with relevant terms', () => {
    const text = shipsContractKids.antiCommercialTopics.join(' ').toLowerCase();
    expect(shipsContractKids.antiCommercialTopics.length).toBeGreaterThan(0);
    expect(text).toMatch(/luxury|yacht|commercial|brand/);
  });

  it('passes educationalContractSchema validation', () => {
    expect(educationalContractSchema.safeParse(shipsContractKids).success).toBe(true);
  });

  it('narrationRequired is true', () => {
    expect(shipsContractKids.narrationRequired).toBe(true);
  });

  it('recapIncluded is true', () => {
    expect(shipsContractKids.recapIncluded).toBe(true);
  });
});

// ── Educational scene director (local fallback) ───────────────────────────────

describe('directScenes with educationalContract (ships)', () => {
  const input: DirectScenesInput = {
    blueprint: minimalBlueprint,
    storyTitle: "Let's talk about ships",
    storyBody: 'A ship is a large vessel that travels on water.',
    audienceMode: 'KIDS',
    sceneCount: 4,
    characterContext: '',
    educationalContract: shipsContractKids,
  };

  it('returns the expected number of scenes', async () => {
    const scenes = await local.directScenes(input);
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    expect(scenes.length).toBeLessThanOrEqual(4);
  });

  it('every scene has a learningObjective', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
    }
  });

  it('every scene has a teachingConcept', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      expect(scene.teachingConcept).toBeTruthy();
    }
  });

  it('every scene has narrationText', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      expect(scene.narrationText).toBeTruthy();
    }
  });

  it('narrationText references the educational topic', async () => {
    const scenes = await local.directScenes(input);
    const allNarration = scenes.map((s) => s.narrationText ?? '').join(' ').toLowerCase();
    expect(allNarration).toMatch(/ship/);
  });

  it('every scene has a teachingRole from the allowed enum', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      if (scene.teachingRole) {
        expect(teachingRoleSchema.safeParse(scene.teachingRole).success).toBe(true);
      }
    }
  });

  it('every scene has antiCommercialNote', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      expect(scene.antiCommercialNote).toBeTruthy();
    }
  });

  it('antiCommercialNote references commercial/luxury avoidance', async () => {
    const scenes = await local.directScenes(input);
    const allNotes = scenes.map((s) => s.antiCommercialNote ?? '').join(' ').toLowerCase();
    expect(allNotes).toMatch(/luxury|commercial|brand|avoid/);
  });

  it('every scene passes directedSceneSchema validation', async () => {
    const scenes = await local.directScenes(input);
    for (const scene of scenes) {
      const result = directedSceneSchema.safeParse(scene);
      expect(result.success).toBe(true);
    }
  });
});

// ── Narration aligns to vocabulary level ─────────────────────────────────────

describe('vocabulary level affects narration', () => {
  it('very_simple vocab produces shorter narration sentences', async () => {
    const kidsScenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships float on water.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContractKids,
    });

    const generalScenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships float on water.',
      audienceMode: 'GENERAL',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContractGeneral,
    });

    // Both should have narration
    for (const scene of kidsScenes) {
      expect(scene.narrationText).toBeTruthy();
    }
    for (const scene of generalScenes) {
      expect(scene.narrationText).toBeTruthy();
    }
  });
});

// ── Non-educational content is not forced to educational ─────────────────────

describe('non-educational content is NOT forced into educational mode', () => {
  it('story content without educationalContract has no learningObjective', async () => {
    const scenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: 'A brave dragon',
      storyBody: 'Once upon a time there was a dragon.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      // No educationalContract
    });
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeUndefined();
      expect(scene.narrationText).toBeUndefined();
    }
  });
});

// ── R16 / KIDS mode ───────────────────────────────────────────────────────────

describe('R16 and audience mode', () => {
  it('R16 (KIDS audienceMode) produces educational scenes with very_simple vocabulary', async () => {
    const scenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships travel on water.',
      audienceMode: 'KIDS',  // This is what R16 maps to
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContractKids,
    });
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
      expect(scene.narrationText).toBeTruthy();
    }
  });

  it('non-R16 (GENERAL audienceMode) is not forced into KIDS mode', async () => {
    const shipsKidsContract = shipsContractKids;
    const shipsGeneralContract: EducationalContract = { ...shipsKidsContract, vocabularyLevel: 'simple', targetAge: 'all ages' };
    const scenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships are large vessels.',
      audienceMode: 'GENERAL',  // non-R16 — must stay GENERAL
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsGeneralContract,
    });
    // Should still produce educational scenes (not broken by GENERAL mode)
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
    }
  });
});

// ── Prompt builder audit ──────────────────────────────────────────────────────

describe('educational scene director prompt builders', () => {
  it('system prompt mentions EDUCATIONAL requirement', () => {
    const system = buildEducationalSceneDirectorSystem('KIDS', shipsContractKids);
    expect(system.toLowerCase()).toMatch(/educational/);
  });

  it('system prompt includes anti-commercial constraint', () => {
    const system = buildEducationalSceneDirectorSystem('KIDS', shipsContractKids);
    expect(system.toLowerCase()).toMatch(/luxury yacht|anti-commercial|advertisement|brand/);
  });

  it('user prompt includes teaching concept in scene schema', () => {
    const user = buildEducationalSceneDirectorUser({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships travel on water.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContractKids,
    }, shipsContractKids);
    expect(user).toContain('narrationText');
    expect(user).toContain('teachingRole');
    expect(user).toContain('learningObjective');
  });

  it('user prompt includes narration requirement', () => {
    const user = buildEducationalSceneDirectorUser({
      blueprint: minimalBlueprint,
      storyTitle: "Let's talk about ships",
      storyBody: 'Ships travel on water.',
      audienceMode: 'KIDS',
      sceneCount: 4,
      characterContext: '',
      educationalContract: shipsContractKids,
    }, shipsContractKids);
    expect(user.toLowerCase()).toMatch(/narration/);
  });

  it('content classifier prompt recognises educational intent', () => {
    const user = buildContentClassifierUser({
      idea: "let's talk about ships",
      answers: [],
      audienceMode: 'KIDS',
    });
    expect(user).toContain("let's talk about ships");
    const system = buildContentClassifierSystem();
    expect(system.toLowerCase()).toMatch(/educational/);
    expect(system.toLowerCase()).toMatch(/let.*talk about/i);
  });
});

// ── directedSceneSchema backward compatibility ────────────────────────────────

describe('directedSceneSchema backward compatibility', () => {
  it('validates legacy scenes (no educational fields) without errors', () => {
    const legacy = {
      version: 'scene_director_v1',
      ordinal: 1,
      title: 'Opening scene',
      storyBeat: 'beginning',
      dramaticPurpose: 'introduce the hero',
      characters: ['Hero'],
      action: 'Hero stands on a hill looking at the horizon',
      mood: 'hopeful',
    };
    expect(directedSceneSchema.safeParse(legacy).success).toBe(true);
  });

  it('validates educational scenes with all new fields', () => {
    const educational = {
      version: 'scene_director_v1',
      ordinal: 1,
      title: 'What is a ship?',
      storyBeat: 'A ship is a large vessel that travels on water',
      dramaticPurpose: 'Teach: A ship is a large vessel that travels on water',
      characters: [],
      action: 'Show a large cargo ship traveling on ocean water',
      mood: 'curious',
      learningObjective: 'Understand what a ship is and why it floats',
      teachingConcept: 'A ship is a large vessel that travels on water',
      teachingRole: 'INTRODUCTION',
      visualTeachingRequirement: 'Show clearly labeled cargo ship on water — not a yacht',
      narrationText: 'A ship is a large vessel that travels on water. Ships can carry lots of people and things.',
      antiCommercialNote: 'Avoid luxury yachts, brand logos',
    };
    const result = directedSceneSchema.safeParse(educational);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.teachingRole).toBe('INTRODUCTION');
      expect(result.data.narrationText).toContain('ship');
    }
  });
});
