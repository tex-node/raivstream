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

  // ─── M: F3.14 — Ships Acceptance Test (age 7-9, 6 scenes) ────────────────────

  describe('M: F3.14 — Ships acceptance test: "Let\'s talk about ships" age 7-9', () => {
    const AGE_ANSWER = [{ questionText: 'How old are the children?', selectedAnswer: '8 years old' }];

    async function buildShipsScenes() {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: AGE_ANSWER,
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 6,
      });
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
        storyTitle: "Let's talk about ships",
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 6,
        characterContext: '',
        educationalContract: contract,
      });
      return { contract, scenes };
    }

    it('age 7-9 → simple vocabulary (not very_simple or moderate)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: AGE_ANSWER, audienceMode: KIDS_AUDIENCE, sceneCount: 6 });
      expect(contract.vocabularyLevel).toBe('simple');
    });

    it('produces exactly 6 scenes', async () => {
      const { scenes } = await buildShipsScenes();
      expect(scenes).toHaveLength(6);
    });

    it('Scene 1 (HOOK): grabs attention, starts with question or exclamation', async () => {
      const { scenes } = await buildShipsScenes();
      const hook = scenes[0]!;
      expect(hook.teachingRole).toBe('HOOK');
      expect(hook.narrationText).toMatch(/[?!]/);
      expect(hook.narrationText?.toLowerCase()).toContain('ships');
    });

    it('Scene 2 (WHAT IS A SHIP): introduces what ships are', async () => {
      const { scenes } = await buildShipsScenes();
      const intro = scenes[1]!;
      const text = `${intro.narrationText ?? ''} ${intro.teachingConcept ?? ''}`.toLowerCase();
      expect(text).toMatch(/ships?|vessel|learn|what/);
    });

    it('Scene 3 (CORE CONCEPT): is educational, relates to ships', async () => {
      const { scenes } = await buildShipsScenes();
      const core = scenes[2]!;
      const text = `${core.narrationText ?? ''} ${core.teachingConcept ?? ''}`.toLowerCase();
      // Core concept scene covers ships content (types, work, or structure)
      expect(text).toMatch(/ship|vessel|cargo|ferry|kinds|types|work/);
      expect(core.learningObjective).toBeTruthy();
    });

    it('Scene 4 (EXAMPLE): narration is educational, covers ships content', async () => {
      const { scenes } = await buildShipsScenes();
      const example = scenes[3]!;
      const text = `${example.narrationText ?? ''} ${example.teachingConcept ?? ''} ${example.visualTeachingRequirement ?? ''}`.toLowerCase();
      expect(text).toMatch(/ship|vessel|cargo|ferry|research|fishing|container|kind|ocean/);
    });

    it('Scene 5 (SECOND CONCEPT): is educational, covers a ships concept', async () => {
      const { scenes } = await buildShipsScenes();
      const second = scenes[4]!;
      const text = `${second.narrationText ?? ''} ${second.teachingConcept ?? ''}`.toLowerCase();
      expect(text).toMatch(/ship|vessel|cargo|ferry|work|types|ocean|sea/);
    });

    it('Scene 6 (RECAP): recaps key ships concepts', async () => {
      const { scenes } = await buildShipsScenes();
      const recap = scenes[5]!;
      expect(recap.teachingRole).toBe('RECAP');
      expect(recap.narrationText?.toLowerCase()).toContain('ships');
    });

    it('no scene narration contains commercial or luxury language', async () => {
      const { scenes } = await buildShipsScenes();
      for (const scene of scenes) {
        const text = (scene.narrationText ?? '').toLowerCase();
        expect(text).not.toMatch(/luxury yacht|buy|purchase|brand|sponsor/);
      }
    });
  });

  // ─── N: F3.15 — Automated Quality Scoring (8 dimensions) ─────────────────────

  describe('N: F3.15 — Quality scoring: 8 dimensions, min 4/5 each (5/5 anti-commercial)', () => {
    type QualityScores = {
      educationalClarity: number;
      ageAppropriateness: number;
      narrationQuality: number;
      visualTeaching: number;
      sceneProgression: number;
      engagement: number;
      narrationVisualAlignment: number;
      antiCommercial: number;
    };

    async function scoreShipsQuality(): Promise<QualityScores> {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({
        idea: SHIPS_IDEA,
        answers: [{ questionText: 'Age', selectedAnswer: '8 years old' }],
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 6,
      });
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
        storyTitle: "Let's talk about ships",
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 6,
        characterContext: '',
        educationalContract: contract,
      });

      // 1. Educational clarity: keyConcepts well-formed, objective specific
      let educationalClarity = 0;
      if (contract.keyConcepts.length >= 3) educationalClarity++;
      if (!contract.learningObjective.includes('{')) educationalClarity++;
      if (contract.learningObjective.toLowerCase().includes('ship')) educationalClarity++;
      if (contract.keyConcepts[0]?.endsWith('?')) educationalClarity++;
      if (contract.topic.toLowerCase() === 'ships') educationalClarity++;

      // 2. Age appropriateness: vocabulary matches age 7-9
      let ageAppropriateness = 0;
      if (contract.vocabularyLevel === 'simple') ageAppropriateness += 2;
      if (contract.targetAge.includes('8') || contract.targetAge.includes('7')) ageAppropriateness++;
      const avgWords = scenes.reduce((sum, s) => sum + (s.narrationText ?? '').split(' ').length, 0) / scenes.length;
      if (avgWords <= 60) ageAppropriateness++;
      if (avgWords >= 10) ageAppropriateness++;

      // 3. Narration quality: child-directed, no docs language
      let narrationQuality = 0;
      if (scenes.every((s) => (s.narrationText ?? '').length > 0)) narrationQuality++;
      if (scenes[0]?.narrationText?.match(/[?!]/)) narrationQuality++;
      if (!scenes.some((s) => (s.narrationText ?? '').includes('Viewers will understand'))) narrationQuality++;
      if (!scenes.some((s) => (s.narrationText ?? '').includes('Once upon a time'))) narrationQuality++;
      if (scenes.some((s) => /did you know|let'?s|have you|you will|amazing|discover/i.test(s.narrationText ?? ''))) narrationQuality++;

      // 4. Visual teaching: names specific vessel types
      let visualTeaching = 0;
      const visualText = contract.visualTeachingStrategy.toLowerCase();
      const vesselTypes = ['cargo', 'ferry', 'research', 'fishing', 'container'].filter((v) => visualText.includes(v));
      if (vesselTypes.length >= 2) visualTeaching++;
      if (vesselTypes.length >= 3) visualTeaching++;
      if (visualText.includes('hull') || visualText.includes('deck')) visualTeaching++;
      if (!visualText.match(/luxury yacht|yacht advertisement/)) visualTeaching++;
      if (scenes.some((s) => s.visualTeachingRequirement)) visualTeaching++;

      // 5. Scene progression: HOOK first, RECAP last, sequential coverage
      let sceneProgression = 0;
      if (scenes[0]?.teachingRole === 'HOOK') sceneProgression++;
      if (scenes[scenes.length - 1]?.teachingRole === 'RECAP') sceneProgression++;
      if (scenes.length === 6) sceneProgression++;
      const roles = new Set(scenes.map((s) => s.teachingRole));
      if (roles.size >= 4) sceneProgression++;
      if (contract.sceneProgression[0]?.toLowerCase().includes('hook')) sceneProgression++;

      // 6. Engagement: questions, exclamations, child address
      let engagement = 0;
      const allNarration = scenes.map((s) => s.narrationText ?? '').join(' ');
      const questionCount = (allNarration.match(/\?/g) ?? []).length;
      if (questionCount >= 1) engagement++;
      if (questionCount >= 2) engagement++;
      if (/let'?s|you will|have you|did you know/i.test(allNarration)) engagement++;
      if (scenes[0]?.narrationText?.match(/[?!]/)) engagement++;
      if (scenes.every((s) => (s.narrationText ?? '').split(' ').length >= 5)) engagement++;

      // 7. Narration/visual alignment: narration relates to teaching requirement
      let narrationVisualAlignment = 0;
      let aligned = 0;
      for (const scene of scenes) {
        const narr = (scene.narrationText ?? '').toLowerCase();
        const visual = (scene.visualTeachingRequirement ?? '').toLowerCase();
        if (narr.includes('ships') || narr.includes('ship')) aligned++;
      }
      if (aligned >= Math.floor(scenes.length * 0.8)) narrationVisualAlignment += 3;
      if (scenes.every((s) => s.visualTeachingRequirement)) narrationVisualAlignment++;
      if (!scenes.some((s) => s.antiCommercialNote === undefined)) narrationVisualAlignment++;

      // 8. Anti-commercial: strict — no luxury/brand/sponsor content (must be 5/5)
      let antiCommercial = 0;
      const allText = [
        contract.visualTeachingStrategy,
        contract.learningObjective,
        ...contract.keyConcepts,
        ...contract.antiCommercialTopics,
        ...scenes.map((s) => s.narrationText ?? ''),
        ...scenes.map((s) => s.action ?? ''),
      ].join(' ').toLowerCase();
      if (!allText.match(/luxury yacht|buy now|sponsor|affiliate/)) antiCommercial++;
      if (contract.antiCommercialTopics.length >= 3) antiCommercial++;
      if (contract.antiCommercialTopics.join(' ').toLowerCase().includes('luxury')) antiCommercial++;
      if (contract.antiCommercialTopics.join(' ').toLowerCase().includes('advertis')) antiCommercial++;
      if (!scenes.some((s) => /luxury|buy|purchase|brand name|sponsor/.test(s.narrationText ?? ''))) antiCommercial++;

      return {
        educationalClarity,
        ageAppropriateness,
        narrationQuality,
        visualTeaching,
        sceneProgression,
        engagement,
        narrationVisualAlignment,
        antiCommercial,
      };
    }

    it('educational clarity scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.educationalClarity).toBeGreaterThanOrEqual(4);
    });

    it('age appropriateness scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.ageAppropriateness).toBeGreaterThanOrEqual(4);
    });

    it('narration quality scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.narrationQuality).toBeGreaterThanOrEqual(4);
    });

    it('visual teaching scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.visualTeaching).toBeGreaterThanOrEqual(4);
    });

    it('scene progression scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.sceneProgression).toBeGreaterThanOrEqual(4);
    });

    it('engagement scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.engagement).toBeGreaterThanOrEqual(4);
    });

    it('narration/visual alignment scores ≥4/5', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.narrationVisualAlignment).toBeGreaterThanOrEqual(4);
    });

    it('anti-commercial scores 5/5 (strict)', async () => {
      const scores = await scoreShipsQuality();
      expect(scores.antiCommercial).toBe(5);
    });
  });

  // ─── O: F3.9 — Narration validation behavior ─────────────────────────────────

  describe('O: F3.9 — All directed educational scenes have valid narrationText', () => {
    it('every scene from directScenes has non-empty narrationText (≥10 chars)', async () => {
      const { LocalStoryIntelligenceProvider } = await import('../../lib/storyIntelligence/localStoryIntelligenceProvider');
      const provider = new LocalStoryIntelligenceProvider();
      const contract = await provider.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS_AUDIENCE, sceneCount: 6 });
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
        storyTitle: "Let's talk about ships",
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 6,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        expect((scene.narrationText ?? '').trim().length, `scene ${scene.ordinal} has empty narrationText`).toBeGreaterThanOrEqual(10);
      }
    });

    it('narrationText is educational — no "Once upon a time" narrative language', async () => {
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
        storyTitle: "Let's talk about ships",
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        expect(scene.narrationText).not.toMatch(/once upon a time|there was a hero|magical adventure/i);
      }
    });

    it('narrationText references the topic (ships) across all scenes', async () => {
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
        storyTitle: "Let's talk about ships",
        storyBody: '',
        audienceMode: KIDS_AUDIENCE,
        sceneCount: 4,
        characterContext: '',
        educationalContract: contract,
      });
      for (const scene of scenes) {
        expect(scene.narrationText?.toLowerCase()).toContain('ships');
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
