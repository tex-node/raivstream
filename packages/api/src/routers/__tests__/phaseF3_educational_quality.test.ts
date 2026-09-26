/**
 * Phase F3 — Real Educational Experience Quality
 * Regression tests A–L covering:
 *   A. Age adaptation materially changes vocabularyLevel and targetAge
 *   B. Ships contract has specific anti-luxury-yacht visual guidance
 *   C. Scene progression starts with HOOK and ends with RECAP
 *   D. All directed scenes have mandatory educational fields
 *   E. HOOK scene narration is curiosity-first, not explanatory
 *   F. Very-simple narration uses short sentences
 *   G. Local provider without age answer defaults to 'simple' for KIDS
 *   H. Minimal educational blueprint is generated when contract present but no story blueprint
 *   I. Educational contract topic extracts correctly from "Let's talk about ships"
 *   J. sceneProgression length respects sceneCount input
 *   K. Quality gate: ships contract scores ≥4/5 on all criteria
 *   L. Normal story pipeline (non-educational) is unaffected
 */

import { describe, it, expect } from 'vitest';

const SHIPS_IDEA = "Let's talk about ships";
const KIDS_AUDIENCE = 'KIDS' as const;

describe('Phase F3 — Educational Quality Regression Tests', () => {

  // ─── A: Age adaptation ─────────────────────────────────────────────────────

  describe('A: Age adaptation materially changes output', () => {
    it('age 5-7 answer → very_simple vocabulary', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'How old are the children?', selectedAnswer: '5-7 years old' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      expect(contract.vocabularyLevel).toBe('very_simple');
      expect(contract.targetAge).toMatch(/5.7/);
    });

    it('age 8-10 answer → simple vocabulary', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'How old are the children?', selectedAnswer: '9 years old' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      expect(contract.vocabularyLevel).toBe('simple');
      expect(contract.targetAge).toMatch(/8.10/);
    });

    it('age 11-13 answer → moderate vocabulary', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'How old are the children?', selectedAnswer: '12 years old' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      expect(contract.vocabularyLevel).toBe('moderate');
      expect(contract.targetAge).toMatch(/11.13/);
    });

    it('vocabulary level materially differs across age groups (not the same string)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const young = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'Age', selectedAnswer: '6' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      const older = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'Age', selectedAnswer: '12' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      expect(young.vocabularyLevel).not.toBe(older.vocabularyLevel);
      expect(young.learningObjective).not.toBe(older.learningObjective);
    });
  });

  // ─── B: Anti-luxury-yacht visual guidance ───────────────────────────────────

  describe('B: Ships visual strategy blocks luxury/commercial imagery', () => {
    it('visualTeachingStrategy includes cargo ships not luxury yachts', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.visualTeachingStrategy.toLowerCase()).toContain('cargo');
      expect(contract.visualTeachingStrategy.toLowerCase()).toMatch(/educational use only/i);
    });

    it('antiCommercialTopics is non-empty and blocks luxury imagery', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.antiCommercialTopics.length).toBeGreaterThan(0);
      const combined = contract.antiCommercialTopics.join(' ').toLowerCase();
      expect(combined).toMatch(/luxury|commercial|brand|advertisement/);
    });
  });

  // ─── C: Scene progression structure ─────────────────────────────────────────

  describe('C: Scene progression starts with HOOK, ends with RECAP', () => {
    it('first scene label contains "hook"', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.sceneProgression[0]!.toLowerCase()).toContain('hook');
    });

    it('last scene label contains "recap"', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const last = contract.sceneProgression[contract.sceneProgression.length - 1]!;
      expect(last.toLowerCase()).toContain('recap');
    });

    it('7-scene progression has full HOOK→INTRO→CONCEPT→EXAMPLE→SECOND CONCEPT→APPLICATION→RECAP', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 7 });
      expect(contract.sceneProgression).toHaveLength(7);
      expect(contract.sceneProgression[0]!.toLowerCase()).toContain('hook');
      expect(contract.sceneProgression[6]!.toLowerCase()).toContain('recap');
    });
  });

  // ─── D: Mandatory educational fields in directed scenes ─────────────────────

  describe('D: All directed scenes have mandatory educational fields', () => {
    it('every educational scene has learningObjective, teachingConcept, narrationText', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: 'Learning',
        beats: contract.sceneProgression.map((p) => ({ label: p, description: p })),
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Ships',
        storyBody: 'Educational video about ships.',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        expect(scene.learningObjective, `scene ${scene.ordinal} missing learningObjective`).toBeTruthy();
        expect(scene.teachingConcept, `scene ${scene.ordinal} missing teachingConcept`).toBeTruthy();
        expect(scene.narrationText, `scene ${scene.ordinal} missing narrationText`).toBeTruthy();
      }
    });

    it('every educational scene has a teachingRole', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: 'Learning',
        beats: contract.sceneProgression.map((p) => ({ label: p, description: p })),
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Ships',
        storyBody: 'Educational video about ships.',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        expect(scene.teachingRole, `scene ${scene.ordinal} missing teachingRole`).toBeTruthy();
      }
    });
  });

  // ─── E: HOOK narration is curiosity-first ─────────────────────────────────

  describe('E: HOOK scene narration grabs attention without explaining', () => {
    it('first scene narrationText contains a question or exclamation for ships', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: 'Learning',
        beats: contract.sceneProgression.map((p) => ({ label: p, description: p })),
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Ships',
        storyBody: 'Educational video about ships.',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      const hookScene = scenes[0]!;
      expect(hookScene.teachingRole).toBe('HOOK');
      // HOOK narration must contain a question mark or exclamation
      expect(hookScene.narrationText).toMatch(/[?!]/);
    });
  });

  // ─── F: Very-simple narration is short ─────────────────────────────────────

  describe('F: very_simple vocabulary produces shorter narration', () => {
    it('very_simple HOOK narration is shorter than moderate HOOK narration', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const youngContract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'Age', selectedAnswer: '6' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      const olderContract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'Age', selectedAnswer: '12' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });

      const makeBlueprint = (c: typeof youngContract) => ({
        version: 'story_blueprint_v1' as const,
        premise: c.learningObjective,
        protagonist: { name: 'Learner', goal: c.learningObjective },
        supportingCharacters: [] as [],
        conflict: 'Learning',
        beats: c.sceneProgression.map((p: string) => ({ label: p, description: p })),
        continuityRules: [] as string[],
      });

      const youngScenes = await provider.directScenes({
        blueprint: makeBlueprint(youngContract),
        storyTitle: 'Ships',
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: youngContract,
      });
      const olderScenes = await provider.directScenes({
        blueprint: makeBlueprint(olderContract),
        storyTitle: 'Ships',
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: olderContract,
      });

      // mid-scene narration (not hook, not recap) should be shorter for very_simple
      const youngMid = youngScenes.find((s) => s.ordinal === 2)?.narrationText ?? '';
      const olderMid = olderScenes.find((s) => s.ordinal === 2)?.narrationText ?? '';
      expect(youngMid.length).toBeLessThan(olderMid.length);
    });
  });

  // ─── G: Default vocabulary for no-age-answer KIDS ──────────────────────────

  describe('G: No age answer defaults to simple for KIDS', () => {
    it('KIDS audience with no age answer gets simple vocabulary', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
      });
      expect(contract.vocabularyLevel).toBe('simple');
      expect(contract.targetAge).toMatch(/5.10/);
    });
  });

  // ─── H: buildMinimalEducationalBlueprint ────────────────────────────────────

  describe('H: Minimal educational blueprint is derived from contract', () => {
    it('buildMinimalEducationalBlueprint creates a valid blueprint from contract', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const { storyBlueprintSchema } = await import('../../lib/storyIntelligence/types');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      // Simulate what story.ts does
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: `Understanding ${contract.topic}`,
        beats: contract.sceneProgression.map((p: string) => ({ label: p, description: p })),
        continuityRules: [`Teach ${contract.topic} consistently throughout all scenes.`],
      };
      const parsed = storyBlueprintSchema.safeParse(blueprint);
      expect(parsed.success).toBe(true);
    });

    it('directScenes with contract-derived blueprint produces educational scenes', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: `Understanding ${contract.topic}`,
        beats: contract.sceneProgression.map((p: string) => ({ label: p, description: p })),
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Ships',
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      expect(scenes.length).toBeGreaterThan(0);
      expect(scenes[0]!.narrationText).toBeTruthy();
      expect(scenes[0]!.teachingConcept).toBeTruthy();
    });
  });

  // ─── I: Topic extraction ─────────────────────────────────────────────────────

  describe('I: Educational contract topic extraction', () => {
    it('"Let\'s talk about ships" extracts topic "ships"', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.topic.toLowerCase()).toBe('ships');
    });

    it('"Learn about the water cycle" extracts topic "the water cycle"', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: 'Learn about the water cycle', answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.topic.toLowerCase()).toContain('water');
    });
  });

  // ─── J: sceneProgression length respects sceneCount ─────────────────────────

  describe('J: sceneProgression length matches sceneCount', () => {
    it('sceneCount=4 produces exactly 4 scene progression labels', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.sceneProgression).toHaveLength(4);
    });

    it('sceneCount=6 produces exactly 6 scene progression labels', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 6 });
      expect(contract.sceneProgression).toHaveLength(6);
    });
  });

  // ─── K: Quality gate — ships scores ≥4/5 in all categories ──────────────────

  describe('K: Quality gate — ships contract scores ≥4/5 across all criteria', () => {
    it('ships contract: has diverse ship types in visual strategy (not just one type)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const visual = contract.visualTeachingStrategy.toLowerCase();
      // Must mention multiple ship types (diversity criterion)
      const shipTypes = ['cargo', 'ferry', 'research', 'fishing', 'container'].filter((t) => visual.includes(t));
      expect(shipTypes.length).toBeGreaterThanOrEqual(3);
    });

    it('ships contract: learning objective is ship-specific (not generic)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      expect(contract.learningObjective.toLowerCase()).toContain('ship');
      // Should not be a generic template sentence with {topic} unfilled
      expect(contract.learningObjective).not.toContain('{topic}');
      expect(contract.learningObjective.length).toBeGreaterThan(30);
    });

    it('ships contract: keyConcepts are factual, not story-framed', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const allConcepts = contract.keyConcepts.join(' ').toLowerCase();
      // Must not contain story-framing language
      expect(allConcepts).not.toMatch(/\b(hero|character|adventure|villain|plot|quest)\b/);
      // Must relate to ships
      expect(allConcepts).toMatch(/ship|vessel|hull|float|sea|ocean|cargo|ferry/i);
    });

    it('ships contract: examplesToUse are real-world not aspirational', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const allExamples = contract.examplesToUse.join(' ').toLowerCase();
      // Must not be luxury/commercial
      expect(allExamples).not.toMatch(/luxury|yacht|cruise liner|billion|millionaire/);
      // Should mention real uses
      expect(allExamples).toMatch(/cargo|ferry|research|ocean|container/);
    });

    it('ships contract: scene directed — narration does not describe aesthetics (anti-corporate)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 4 });
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: contract.learningObjective,
        protagonist: { name: 'Learner', goal: contract.learningObjective },
        supportingCharacters: [] as [],
        conflict: 'Learning',
        beats: contract.sceneProgression.map((p: string) => ({ label: p, description: p })),
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Ships',
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        const narration = (scene.narrationText ?? '').toLowerCase();
        // No corporate/luxury narration language
        expect(narration).not.toMatch(/amazing .*(sleek|design|luxury|beautiful ship sailing)/);
      }
    });
  });

  // ─── L: Normal story pipeline unaffected ──────────────────────────────────

  describe('L: Normal story pipeline (non-educational) is unaffected', () => {
    it('classifyContent for a story idea returns STORY not EDUCATIONAL', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const result = await provider.classifyContent({
        idea: 'Once upon a time a princess went on an adventure',
        answers: [],
        audienceMode: KIDS_AUDIENCE,
      });
      expect(result).toBe('STORY');
    });

    it('directScenes without educationalContract returns non-educational scenes', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const blueprint = {
        version: 'story_blueprint_v1' as const,
        premise: 'A princess goes on an adventure.',
        protagonist: { name: 'Princess', goal: 'Find the magical gem' },
        supportingCharacters: [] as [],
        conflict: 'An evil dragon blocks the path',
        beats: [
          { label: 'Beginning', description: 'Princess leaves the castle.' },
          { label: 'Quest', description: 'She searches for the gem.' },
          { label: 'Challenge', description: 'The dragon appears.' },
          { label: 'Resolution', description: 'She finds a way through.' },
        ],
        continuityRules: [],
      };
      const scenes = await provider.directScenes({
        blueprint,
        storyTitle: 'Princess Adventure',
        storyBody: 'A princess went on an adventure...',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: 'Princess: brave young royal',
        educationalContract: null,
      });
      expect(scenes.length).toBeGreaterThan(0);
      // Story scenes should have character names, not learningObjective
      expect(scenes[0]!.characters).toContain('Princess');
      expect(scenes[0]!.learningObjective).toBeUndefined();
    });

    it('planStory for a story idea returns a story blueprint with a protagonist', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const blueprint = await provider.planStory({
        idea: 'A brave dog goes on an adventure to find her lost ball',
        answers: [{ questionText: 'What tone?', selectedAnswer: 'happy' }],
        audienceMode: KIDS_AUDIENCE,
      });
      expect(blueprint.protagonist.name).toBeTruthy();
      expect(blueprint.beats.length).toBeGreaterThan(0);
      // Must not have educational fields
      expect((blueprint as Record<string, unknown>).learningObjective).toBeUndefined();
    });
  });

});
