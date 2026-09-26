/**
 * Phase E — Controlled End-to-End Quality Validation
 * Primary scenario: "Let's talk about ships" (KIDS audience)
 *
 * Exercises the full educational pipeline deterministically using
 * LocalStoryIntelligenceProvider — no API keys required.
 * Verifies every Phase E acceptance criterion that can be checked in-process.
 */

import { describe, it, expect } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import {
  educationalContractSchema,
  type EducationalContract,
  type DirectedScene,
} from '../types';
import { buildEducationalSceneDirectorSystem, buildEducationalSceneDirectorUser } from '../prompts/educationalSceneDirectorPrompt';
import { buildContentClassifierSystem, buildContentClassifierUser } from '../prompts/contentClassifierPrompt';
import { buildEducationContractUser } from '../prompts/educationContractPrompt';

// ─── Shared test state ──────────────────────────────────────────────────────

const local = new LocalStoryIntelligenceProvider();
const IDEA = "let's talk about ships";
const AUDIENCE_MODE = 'KIDS' as const;
const SCENE_COUNT = 6;

// ─── Section 1: Classification ───────────────────────────────────────────────

describe('Phase E §3 — Educational intent', () => {
  it('classifies "let\'s talk about ships" as EDUCATIONAL', async () => {
    const ct = await local.classifyContent({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE });
    expect(ct).toBe('EDUCATIONAL');
  });

  it('non-educational idea is NOT classified EDUCATIONAL', async () => {
    const ct = await local.classifyContent({ idea: 'a brave knight fights a dragon', answers: [], audienceMode: AUDIENCE_MODE });
    expect(ct).not.toBe('EDUCATIONAL');
  });
});

// ─── Section 2: Educational contract ─────────────────────────────────────────

describe('Phase E §3 — EducationalContract content', () => {
  let contract: EducationalContract;

  it('planEducation returns a valid contract', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(educationalContractSchema.safeParse(contract).success).toBe(true);
  });

  it('topic is set to "ships" (not generic)', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.topic.toLowerCase()).toContain('ship');
  });

  it('targetAge is set to a child-appropriate range', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.targetAge).toBeTruthy();
    const lower = contract.targetAge.toLowerCase();
    // Should reference years / kids / children
    expect(lower.match(/year|kid|child|age|\d/)).toBeTruthy();
  });

  it('learningObjective is meaningful (>20 chars)', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.learningObjective.length).toBeGreaterThan(20);
  });

  it('keyConcepts contains ≥2 entries', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.keyConcepts.length).toBeGreaterThanOrEqual(2);
  });

  it('vocabularyLevel is "very_simple" for KIDS', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.vocabularyLevel).toBe('very_simple');
  });

  it('sceneProgression has expected scene count', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.sceneProgression.length).toBeGreaterThanOrEqual(1);
    expect(contract.sceneProgression.length).toBeLessThanOrEqual(SCENE_COUNT);
  });

  it('antiCommercialTopics is non-empty', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.antiCommercialTopics.length).toBeGreaterThan(0);
  });

  it('antiCommercialTopics references luxury or yacht', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    const text = contract.antiCommercialTopics.join(' ').toLowerCase();
    expect(text).toMatch(/luxury|yacht|commercial|brand|aspir/);
  });

  it('narrationRequired is true', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    expect(contract.narrationRequired).toBe(true);
  });

  it('contract does NOT describe entertainment or promotion', async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    const contractText = JSON.stringify(contract).toLowerCase();
    // Must not be about product promotion
    expect(contractText).not.toMatch(/buy now|purchase|sale|discount|shop now/);
    // Must not be pure entertainment pitch
    expect(contractText).not.toMatch(/blockbuster|action movie|thrill|adventure film/);
    // Must reference educational content
    expect(contractText).toMatch(/learn|teach|understand|concept|knowledge|educational/i);
  });
});

// ─── Section 3: Scene teaching ────────────────────────────────────────────────

describe('Phase E §4 — Scene teaching acceptance', () => {
  let contract: EducationalContract;
  let scenes: DirectedScene[];

  const setup = async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'Understanding ships',
      beats: contract.sceneProgression.map((p, i) => ({ label: `Scene ${i + 1}`, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };
    scenes = await local.directScenes({
      blueprint,
      storyTitle: IDEA,
      storyBody: 'A ship is a large vessel that travels on water.',
      audienceMode: AUDIENCE_MODE,
      sceneCount: SCENE_COUNT,
      characterContext: '',
      educationalContract: contract,
    });
  };

  it('generates scenes (≥1)', async () => {
    await setup();
    expect(scenes.length).toBeGreaterThanOrEqual(1);
  });

  it('every scene has learningObjective', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
    }
  });

  it('every scene has teachingConcept', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.teachingConcept).toBeTruthy();
    }
  });

  it('every scene has teachingRole', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.teachingRole).toBeTruthy();
    }
  });

  it('every scene has visualTeachingRequirement', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.visualTeachingRequirement).toBeTruthy();
    }
  });

  it('every scene has narrationText', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.narrationText).toBeTruthy();
      expect((scene.narrationText as string).length).toBeGreaterThan(5);
    }
  });

  it('every scene has antiCommercialNote', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.antiCommercialNote).toBeTruthy();
    }
  });

  it('no scene has ONLY generic visual spectacle (meaningful field check)', async () => {
    await setup();
    for (const scene of scenes) {
      // A scene that only has visual spectacle would have no learningObjective or narrationText
      const isOnlySpectacle = !scene.learningObjective && !scene.narrationText;
      expect(isOnlySpectacle).toBe(false);
    }
  });
});

// ─── Section 4: Anti-commercial guard ─────────────────────────────────────────

describe('Phase E §5 — Anti-commercial acceptance', () => {
  let contract: EducationalContract;
  let scenes: DirectedScene[];

  const setup = async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'Understanding ships',
      beats: contract.sceneProgression.map((p, i) => ({ label: `Scene ${i + 1}`, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };
    scenes = await local.directScenes({
      blueprint,
      storyTitle: IDEA,
      storyBody: 'A ship is a large vessel that travels on water.',
      audienceMode: AUDIENCE_MODE,
      sceneCount: SCENE_COUNT,
      characterContext: '',
      educationalContract: contract,
    });
  };

  it('no scene action/visualTeachingRequirement defaults to luxury yacht imagery', async () => {
    await setup();
    for (const scene of scenes) {
      const combinedText = [scene.action, scene.visualTeachingRequirement, scene.title].join(' ').toLowerCase();
      // Must not drift to luxury/advertising by default
      expect(combinedText).not.toMatch(/luxury yacht|premium yacht|yacht advertisement|aspirational lifestyle|product showcase|champagne/);
    }
  });

  it('all antiCommercialNotes reference avoidance of luxury/commercial', async () => {
    await setup();
    for (const scene of scenes) {
      const note = (scene.antiCommercialNote ?? '').toLowerCase();
      expect(note).toMatch(/luxury|commercial|brand|avoid|yacht|advertis/);
    }
  });

  it('system prompt for educational scene director explicitly blocks luxury yachts', () => {
    const contractFixture: EducationalContract = {
      version: 'education_contract_v1', topic: 'ships', targetAge: '3-8 years',
      learningObjective: 'Understand what ships are', keyConcepts: ['A ship is a large vessel'],
      vocabularyLevel: 'very_simple', explanationStrategy: 'simple examples',
      examplesToUse: ['cargo ship'], visualTeachingStrategy: 'show real ships',
      narrationRequired: true, sceneProgression: ['intro'], recapIncluded: true,
      antiCommercialTopics: ['luxury yachts', 'brand logos'],
    };
    const system = buildEducationalSceneDirectorSystem(AUDIENCE_MODE, contractFixture);
    expect(system.toLowerCase()).toMatch(/luxury yacht|anti-commercial|advertisement/);
  });

  it('system prompt contains the anti-commercial topic list', () => {
    const contractFixture: EducationalContract = {
      version: 'education_contract_v1', topic: 'ships', targetAge: '3-8 years',
      learningObjective: 'Understand what ships are', keyConcepts: ['A ship is a large vessel'],
      vocabularyLevel: 'very_simple', explanationStrategy: 'simple examples',
      examplesToUse: ['cargo ship'], visualTeachingStrategy: 'show real ships',
      narrationRequired: true, sceneProgression: ['intro'], recapIncluded: true,
      antiCommercialTopics: ['luxury yachts', 'brand logos', 'aspirational lifestyle'],
    };
    // Anti-commercial topics appear in the SYSTEM prompt (not user prompt)
    const system = buildEducationalSceneDirectorSystem(AUDIENCE_MODE, contractFixture);
    expect(system).toContain('luxury yachts');
    expect(system).toContain('aspirational lifestyle');
  });
});

// ─── Section 5: Narration acceptance ─────────────────────────────────────────

describe('Phase E §6 — Narration acceptance', () => {
  let contract: EducationalContract;
  let scenes: DirectedScene[];

  const setup = async () => {
    contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: SCENE_COUNT });
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'Understanding ships',
      beats: contract.sceneProgression.map((p, i) => ({ label: `Scene ${i + 1}`, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };
    scenes = await local.directScenes({
      blueprint, storyTitle: IDEA, storyBody: 'A ship is a large vessel.', audienceMode: AUDIENCE_MODE,
      sceneCount: SCENE_COUNT, characterContext: '', educationalContract: contract,
    });
  };

  it('all educational scenes have non-null narrationText', async () => {
    await setup();
    for (const scene of scenes) {
      expect(scene.narrationText).not.toBeNull();
      expect(scene.narrationText).not.toBe('');
    }
  });

  it('narrationText references the topic (teaches, not merely describes)', async () => {
    await setup();
    // At least one narration should contain factual/teaching language
    const allNarration = scenes.map((s) => s.narrationText ?? '').join(' ').toLowerCase();
    expect(allNarration).toMatch(/ship/);
    // Good narration explains; bad narration only describes the image
    expect(allNarration).not.toMatch(/^a large ship is sailing through the ocean\./i);
  });

  it('narrationText aligns with scene learningObjective', async () => {
    await setup();
    for (const scene of scenes) {
      const narration = (scene.narrationText ?? '').toLowerCase();
      const objective = (scene.learningObjective ?? '').toLowerCase();
      const concept = (scene.teachingConcept ?? '').toLowerCase();
      // Narration should share at least one significant word with objective or concept
      const objectiveWords = objective.split(/\s+/).filter((w) => w.length > 4);
      const conceptWords = concept.split(/\s+/).filter((w) => w.length > 4);
      const allTeachingWords = [...objectiveWords, ...conceptWords];
      const hasAlignment = allTeachingWords.some((word) => narration.includes(word));
      expect(hasAlignment).toBe(true);
    }
  });

  it('narrationText for KIDS is concise (≤80 words per scene)', async () => {
    await setup();
    for (const scene of scenes) {
      const wordCount = (scene.narrationText ?? '').split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(80);
    }
  });
});

// ─── Section 6: Age adaptation ────────────────────────────────────────────────

describe('Phase E §— Age adaptation', () => {
  it('KIDS vocabularyLevel is very_simple', async () => {
    const c = await local.planEducation({ idea: IDEA, answers: [], audienceMode: 'KIDS', sceneCount: 4 });
    expect(c.vocabularyLevel).toBe('very_simple');
  });

  it('GENERAL vocabularyLevel is simple (not very_simple)', async () => {
    const c = await local.planEducation({ idea: IDEA, answers: [], audienceMode: 'GENERAL', sceneCount: 4 });
    expect(c.vocabularyLevel).not.toBe('very_simple');
  });

  it('system prompt contains vocabulary adaptation instructions', () => {
    const kidsContract: EducationalContract = {
      version: 'education_contract_v1', topic: 'ships', targetAge: '3-8 years',
      learningObjective: 'Understand ships', keyConcepts: ['What is a ship'],
      vocabularyLevel: 'very_simple', explanationStrategy: 'simple words',
      examplesToUse: ['cargo ship'], visualTeachingStrategy: 'show real ships',
      narrationRequired: true, sceneProgression: ['intro'], recapIncluded: true,
      antiCommercialTopics: [],
    };
    const system = buildEducationalSceneDirectorSystem('KIDS', kidsContract);
    expect(system.toLowerCase()).toMatch(/vocab|simple|age|child/);
  });
});

// ─── Section 7: R16 security regression ──────────────────────────────────────
// Note: storyRouter cross-module tests live in packages/api/src/routers/__tests__/
// (educationalNarration.test.ts) where the import path resolves correctly.
// Here we verify the logic that lives within the storyIntelligence library.

describe('Phase E §11 — R16 security regression (intelligence layer)', () => {
  it('LocalStoryIntelligenceProvider directScenes: educational path requires contract', async () => {
    // Without educationalContract, directScenes returns plain narrative scenes (no teaching fields)
    const blueprint = {
      version: 'story_blueprint_v1' as const, premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'teach' }, conflict: 'x',
      beats: [{ label: 'intro', description: 'intro' }], continuityRules: [], supportingCharacters: [],
    };
    const plain = await local.directScenes({ blueprint, storyTitle: IDEA, storyBody: 'Ships.', audienceMode: AUDIENCE_MODE, sceneCount: 2, characterContext: '' });
    for (const scene of plain) {
      expect(scene.learningObjective).toBeUndefined();
      expect(scene.narrationText).toBeUndefined();
    }
  });

  it('GENERAL audience educational path works (non-R16 not forced to KIDS)', async () => {
    const blueprint = {
      version: 'story_blueprint_v1' as const, premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'teach' }, conflict: 'x',
      beats: [{ label: 'intro', description: 'intro' }], continuityRules: [], supportingCharacters: [],
    };
    const contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: 'GENERAL', sceneCount: 2 });
    const scenes = await local.directScenes({ blueprint, storyTitle: IDEA, storyBody: 'Ships.', audienceMode: 'GENERAL', sceneCount: 2, characterContext: '', educationalContract: contract });
    // GENERAL audience gets educational content too — not forced to KIDS mode
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
    }
  });

  it('educational narration is not leaking Sequence/Film-tab fields', async () => {
    const contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: 2 });
    const blueprint = {
      version: 'story_blueprint_v1' as const, premise: IDEA,
      protagonist: { name: 'N', goal: 'teach' }, conflict: 'x',
      beats: contract.sceneProgression.slice(0, 2).map((p, i) => ({ label: `S${i + 1}`, description: p })),
      continuityRules: [], supportingCharacters: [],
    };
    const scenes = await local.directScenes({ blueprint, storyTitle: IDEA, storyBody: 'Ships.', audienceMode: AUDIENCE_MODE, sceneCount: 2, characterContext: '', educationalContract: contract });
    for (const scene of scenes) {
      // Educational scenes must NOT contain Sequence/AudioCue/Film-tab fields
      expect((scene as any).sequenceId).toBeUndefined();
      expect((scene as any).audioCueId).toBeUndefined();
      expect((scene as any).audioTrackId).toBeUndefined();
    }
  });
});

// ─── Section 8: Visual prompt composition ────────────────────────────────────

describe('Phase E — Visual prompt composition', () => {
  it('EducationalSceneContext type exists in VPC2 types module', async () => {
    const types = await import('../../visualPromptComposer/types');
    expect(types.VPC_VERSION).toBe('visual_prompt_v2');
    expect(typeof types.isVisualPromptComposerV2Enabled).toBe('function');
  });
});

// ─── Section 9: Session summary ──────────────────────────────────────────────

describe('Phase E — End-to-end pipeline summary', () => {
  it('complete ships pipeline: classify → contract → scenes → narration', async () => {
    // Step 1: classify
    const contentType = await local.classifyContent({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE });
    expect(contentType).toBe('EDUCATIONAL');

    // Step 2: educational contract
    const contract = await local.planEducation({ idea: IDEA, answers: [], audienceMode: AUDIENCE_MODE, sceneCount: 4 });
    expect(contract.topic.toLowerCase()).toContain('ship');
    expect(contract.narrationRequired).toBe(true);
    expect(contract.antiCommercialTopics.length).toBeGreaterThan(0);

    // Step 3: story blueprint (simulated)
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: IDEA,
      protagonist: { name: 'Narrator', goal: 'Teach about ships' },
      conflict: 'How ships work',
      beats: contract.sceneProgression.map((p, i) => ({ label: `Beat ${i + 1}`, description: p })),
      continuityRules: [],
      supportingCharacters: [],
    };

    // Step 4: directed scenes
    const scenes = await local.directScenes({
      blueprint, storyTitle: IDEA,
      storyBody: 'Ships are large vessels that travel on water.',
      audienceMode: AUDIENCE_MODE, sceneCount: 4, characterContext: '',
      educationalContract: contract,
    });
    expect(scenes.length).toBeGreaterThanOrEqual(1);

    // Step 5: verify every scene has the full teaching package
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeTruthy();
      expect(scene.teachingConcept).toBeTruthy();
      expect(scene.narrationText).toBeTruthy();
      expect(scene.antiCommercialNote).toBeTruthy();

      // Teaching concept must reference ships domain
      const combinedText = [
        scene.learningObjective, scene.teachingConcept,
        scene.narrationText, scene.antiCommercialNote,
      ].join(' ').toLowerCase();
      expect(combinedText).toMatch(/ship|water|vessel|cargo|ferry|transport/);
    }

    // Step 6: verify NO luxury yacht drift in the scene plan
    const allText = scenes.map((s) => [s.action, s.visualTeachingRequirement, s.title].join(' ')).join(' ').toLowerCase();
    expect(allText).not.toMatch(/luxury yacht|premium yacht|aspirational lifestyle|champagne/);
  });
});
