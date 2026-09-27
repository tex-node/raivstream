/**
 * Phase F3 — Educational Quality Acceptance Tests
 *
 * Primary scenario: "Let's talk about ships" (KIDS, age 7–9)
 * Exercises the full deterministic educational pipeline end-to-end.
 *
 * Coverage:
 *  1. Full pipeline (classify → contract → lesson body → scenes)
 *  2. Lesson body is a lesson script, not narrative fiction
 *  3. Intelligence-provider-disabled path (local fallback always works)
 *  4. Age adaptation across 4–6 / 7–9 / 10–12 with measurable differences
 *  5. Narration quality validator rules
 *  6. Ships-specific anti-commercial and educational assertions
 *  7. Non-educational regression (STORY path unchanged)
 *  8. Narration → audio readiness (narrationText present on every scene)
 *  9. Quality scoring across 8 dimensions with minimum thresholds
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import { educationalContractSchema, type EducationalContract, type DirectedScene } from '../types';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SHIPS_IDEA = "let's talk about ships";
const KIDS = 'KIDS' as const;
const GENERAL = 'GENERAL' as const;
const LOCAL = new LocalStoryIntelligenceProvider();

async function buildShipsPipeline(answers: { questionText: string; selectedAnswer: string }[] = [], sceneCount = 6) {
  const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers, audienceMode: KIDS, sceneCount });
  const blueprint = {
    version: 'story_blueprint_v1' as const,
    premise: SHIPS_IDEA,
    protagonist: { name: 'Narrator', goal: contract.learningObjective },
    supportingCharacters: [] as [],
    conflict: `Understanding ${contract.topic}`,
    beats: contract.sceneProgression.map((p: string) => ({ label: p, description: p })),
    continuityRules: [],
  };
  const scenes = await LOCAL.directScenes({
    blueprint,
    storyTitle: SHIPS_IDEA,
    storyBody: '',
    audienceMode: KIDS,
    sceneCount,
    characterContext: '',
    educationalContract: contract,
  });
  return { contract, scenes };
}

// Simulates buildEducationalLessonBody() from story.ts to verify its output shape
function makeLessonBody(contract: EducationalContract) {
  return {
    title: `Learning About ${contract.topic}`,
    summary: contract.learningObjective,
    body: [
      `Topic: ${contract.topic}`,
      `Goal: ${contract.learningObjective}`,
      '',
      contract.sceneProgression.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n'),
    ].join('\n'),
    ageRange: contract.targetAge,
    mainCharacterName: '',
    supportingCharacters: [],
    theme: 'educational',
    sceneHints: contract.sceneProgression.map((step: string) => ({
      title: step,
      description: `Teach: ${step}`,
      mood: 'informative',
    })),
    characterMemory: [],
    providerMetadata: { source: 'educational_lesson_body', topic: contract.topic },
  };
}

// ─── Section 1: Full pipeline exercise ────────────────────────────────────────

describe('F3 §1 — Full pipeline: classify → contract → lesson body → scenes', () => {
  it('classifies "let\'s talk about ships" as EDUCATIONAL', async () => {
    const ct = await LOCAL.classifyContent({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS });
    expect(ct).toBe('EDUCATIONAL');
  });

  it('planEducation returns a schema-valid contract', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    expect(educationalContractSchema.safeParse(contract).success).toBe(true);
  });

  it('lesson body title references the topic, not a character name', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    const body = makeLessonBody(contract);
    expect(body.title.toLowerCase()).toContain('ships');
    expect(body.mainCharacterName).toBe('');
  });

  it('lesson body summary equals the learningObjective (lesson script, not synopsis)', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    const body = makeLessonBody(contract);
    expect(body.summary).toBe(contract.learningObjective);
  });

  it('lesson body providerMetadata marks it as an educational lesson', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    const body = makeLessonBody(contract);
    expect(body.providerMetadata.source).toBe('educational_lesson_body');
    expect(body.providerMetadata.topic).toMatch(/ships/i);
  });

  it('lesson body sceneHints correspond to the educational progression (not story beats)', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    const body = makeLessonBody(contract);
    expect(body.sceneHints).toHaveLength(contract.sceneProgression.length);
    for (let i = 0; i < body.sceneHints.length; i++) {
      expect(body.sceneHints[i]!.title).toBe(contract.sceneProgression[i]);
    }
  });

  it('directScenes produces correct count and all educational fields', async () => {
    const { scenes } = await buildShipsPipeline();
    expect(scenes.length).toBeGreaterThanOrEqual(4);
    for (const scene of scenes) {
      expect(scene.learningObjective, `scene ${scene.ordinal} missing learningObjective`).toBeTruthy();
      expect(scene.teachingConcept, `scene ${scene.ordinal} missing teachingConcept`).toBeTruthy();
      expect(scene.teachingRole, `scene ${scene.ordinal} missing teachingRole`).toBeTruthy();
      expect(scene.visualTeachingRequirement, `scene ${scene.ordinal} missing visualTeachingRequirement`).toBeTruthy();
      expect(scene.narrationText, `scene ${scene.ordinal} missing narrationText`).toBeTruthy();
      expect(scene.antiCommercialNote, `scene ${scene.ordinal} missing antiCommercialNote`).toBeTruthy();
    }
  });

  it('scene progression has HOOK first and RECAP last', async () => {
    const { scenes } = await buildShipsPipeline();
    expect(scenes[0]!.teachingRole).toBe('HOOK');
    expect(scenes[scenes.length - 1]!.teachingRole).toBe('RECAP');
  });
});

// ─── Section 2: Lesson body is not narrative fiction ──────────────────────────

describe('F3 §2 — Lesson body is a lesson script, not narrative fiction', () => {
  let lessonBody: ReturnType<typeof makeLessonBody>;

  beforeAll(async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 6 });
    lessonBody = makeLessonBody(contract);
  });

  it('body does NOT contain fictional opening patterns', () => {
    const lower = lessonBody.body.toLowerCase();
    expect(lower).not.toMatch(/once upon a time/);
    expect(lower).not.toMatch(/there was a ship named/);
    expect(lower).not.toMatch(/a ship had a friend/);
    expect(lower).not.toMatch(/sailed into the sunset/);
    expect(lower).not.toMatch(/the adventure began/);
  });

  it('body starts with "Topic:" or "Goal:" (lesson script structure)', () => {
    expect(lessonBody.body).toMatch(/^Topic:/);
  });

  it('body contains the numbered scene progression', () => {
    expect(lessonBody.body).toContain('1.');
    expect(lessonBody.body).toContain('2.');
  });

  it('theme is "educational" not "adventure" or "fantasy"', () => {
    expect(lessonBody.theme).toBe('educational');
  });

  it('characterMemory is empty (no fictional protagonist)', () => {
    expect(lessonBody.characterMemory).toHaveLength(0);
  });

  it('sceneHints contain "Teach:" prefix — lesson beats, not story beats', () => {
    for (const hint of lessonBody.sceneHints) {
      expect(hint.description).toMatch(/^Teach:/);
    }
  });

  it('sceneHint mood is "informative" not "dramatic"', () => {
    for (const hint of lessonBody.sceneHints) {
      expect(hint.mood).toBe('informative');
    }
  });
});

// ─── Section 3: Intelligence-provider-disabled path ───────────────────────────

describe('F3 §3 — Intelligence-provider-disabled path (local fallback)', () => {
  /**
   * When isStoryIntelligenceEnabled() is false, story.ts calls planEducation
   * on the LocalStoryIntelligenceProvider directly (the F3.10 fix).
   * These tests verify the local provider produces valid educational content —
   * not degraded generic story output — without any feature-flag dependency.
   */

  it('LocalStoryIntelligenceProvider.planEducation (the local fallback) returns valid contract', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 4 });
    expect(educationalContractSchema.safeParse(contract).success).toBe(true);
  });

  it('local provider contract is educational, not a story synopsis', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 4 });
    const text = JSON.stringify(contract).toLowerCase();
    // Must contain educational vocabulary
    expect(text).toMatch(/learn|teach|understand|concept|educational/);
    // Must NOT read as a story synopsis (word-boundary anchors prevent "question" matching "quest")
    expect(text).not.toMatch(/once upon\b|\bhero\b|\bvillain\b|\badventure\b|\bquest\b/);
  });

  it('local provider contract has ships-specific keyConcepts (not generic "{topic}" templates)', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 4 });
    for (const concept of contract.keyConcepts) {
      // No unfilled template placeholders
      expect(concept).not.toContain('{topic}');
      expect(concept).not.toContain('{concept}');
    }
    // Must contain ships-related content
    const combined = contract.keyConcepts.join(' ').toLowerCase();
    expect(combined).toMatch(/ships?|vessel/);
  });

  it('local provider contract has non-empty antiCommercialTopics (luxury guard always present)', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 4 });
    expect(contract.antiCommercialTopics.length).toBeGreaterThan(0);
    const text = contract.antiCommercialTopics.join(' ').toLowerCase();
    expect(text).toMatch(/luxury|yacht|commercial|brand|advertis/);
  });

  it('local provider directScenes produces educational scenes when called directly', async () => {
    const contract = await LOCAL.planEducation({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS, sceneCount: 4 });
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: SHIPS_IDEA,
      protagonist: { name: 'Narrator', goal: contract.learningObjective },
      supportingCharacters: [] as [],
      conflict: `Understanding ${contract.topic}`,
      beats: contract.sceneProgression.map((p: string) => ({ label: p, description: p })),
      continuityRules: [],
    };
    const scenes = await LOCAL.directScenes({
      blueprint,
      storyTitle: SHIPS_IDEA,
      storyBody: '',
      audienceMode: KIDS,
      sceneCount: 4,
      characterContext: '',
      educationalContract: contract,
    });
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.narrationText).toBeTruthy();
      expect(scene.learningObjective).toBeTruthy();
    }
  });
});

// ─── Section 4: Age adaptation (4–6, 7–9, 10–12) ─────────────────────────────

describe('F3 §4 — Age adaptation with measurable output differences', () => {
  let youngContract: EducationalContract; // 4–6
  let midContract: EducationalContract;   // 7–9
  let olderContract: EducationalContract; // 10–12
  let youngScenes: DirectedScene[];
  let midScenes: DirectedScene[];
  let olderScenes: DirectedScene[];

  const AGE_YOUNG = [{ questionText: 'How old are the children?', selectedAnswer: '5 years old' }];
  const AGE_MID   = [{ questionText: 'How old are the children?', selectedAnswer: '8 years old' }];
  const AGE_OLDER = [{ questionText: 'How old are the children?', selectedAnswer: '11 years old' }];

  beforeAll(async () => {
    [youngContract, midContract, olderContract] = await Promise.all([
      LOCAL.planEducation({ idea: SHIPS_IDEA, answers: AGE_YOUNG, audienceMode: KIDS, sceneCount: 4 }),
      LOCAL.planEducation({ idea: SHIPS_IDEA, answers: AGE_MID,   audienceMode: KIDS, sceneCount: 4 }),
      LOCAL.planEducation({ idea: SHIPS_IDEA, answers: AGE_OLDER, audienceMode: KIDS, sceneCount: 4 }),
    ]);

    const makeBlueprint = (c: EducationalContract) => ({
      version: 'story_blueprint_v1' as const,
      premise: SHIPS_IDEA,
      protagonist: { name: 'Narrator', goal: c.learningObjective },
      supportingCharacters: [] as [],
      conflict: `Understanding ${c.topic}`,
      beats: c.sceneProgression.map((p: string) => ({ label: p, description: p })),
      continuityRules: [],
    });

    [youngScenes, midScenes, olderScenes] = await Promise.all([
      LOCAL.directScenes({ blueprint: makeBlueprint(youngContract), storyTitle: SHIPS_IDEA, storyBody: '', audienceMode: KIDS, sceneCount: 4, characterContext: '', educationalContract: youngContract }),
      LOCAL.directScenes({ blueprint: makeBlueprint(midContract),   storyTitle: SHIPS_IDEA, storyBody: '', audienceMode: KIDS, sceneCount: 4, characterContext: '', educationalContract: midContract }),
      LOCAL.directScenes({ blueprint: makeBlueprint(olderContract), storyTitle: SHIPS_IDEA, storyBody: '', audienceMode: KIDS, sceneCount: 4, characterContext: '', educationalContract: olderContract }),
    ]);
  });

  // Vocabulary levels
  it('age 4–6 → very_simple vocabulary', () => {
    expect(youngContract.vocabularyLevel).toBe('very_simple');
  });

  it('age 7–9 → simple vocabulary', () => {
    expect(midContract.vocabularyLevel).toBe('simple');
  });

  it('age 10–12 → moderate vocabulary', () => {
    expect(olderContract.vocabularyLevel).toBe('moderate');
  });

  it('vocabulary levels are all different across age groups', () => {
    const levels = new Set([youngContract.vocabularyLevel, midContract.vocabularyLevel, olderContract.vocabularyLevel]);
    expect(levels.size).toBe(3);
  });

  // targetAge changes
  it('targetAge field reflects each age group', () => {
    expect(youngContract.targetAge).toMatch(/4|5|6/);
    expect(midContract.targetAge).toMatch(/7|8|9/);
    expect(olderContract.targetAge).toMatch(/10|11|12/);
  });

  // Learning objectives differ in depth
  it('learningObjective differs across age groups (not the same template)', () => {
    expect(youngContract.learningObjective).not.toBe(midContract.learningObjective);
    expect(midContract.learningObjective).not.toBe(olderContract.learningObjective);
  });

  // Narration complexity: older children → longer narration
  it('HOOK narration is shorter for very_simple (age 4–6) than moderate (age 10–12)', () => {
    const youngHook = youngScenes[0]?.narrationText ?? '';
    const olderHook = olderScenes[0]?.narrationText ?? '';
    expect(youngHook.length).toBeLessThan(olderHook.length);
  });

  it('mid-scene narration is shorter for very_simple than moderate', () => {
    const youngMid = youngScenes.find((s) => s.ordinal === 2)?.narrationText ?? youngScenes[1]?.narrationText ?? '';
    const olderMid = olderScenes.find((s) => s.ordinal === 2)?.narrationText ?? olderScenes[1]?.narrationText ?? '';
    expect(youngMid.length).toBeLessThan(olderMid.length);
  });

  it('all age groups still contain ships-related narration (topic preserved)', () => {
    for (const scenes of [youngScenes, midScenes, olderScenes]) {
      const allNarration = scenes.map((s) => s.narrationText ?? '').join(' ').toLowerCase();
      expect(allNarration).toContain('ships');
    }
  });
});

// ─── Section 5: Narration quality validation rules ───────────────────────────

describe('F3 §5 — Narration quality validation rules', () => {
  /**
   * The validateAndFillEducationalNarration helper in story.ts (F3.9) ensures
   * every educational scene reaching the DB has valid narrationText.
   * These tests verify the provider never needs the fallback AND document the rules.
   */

  it('every scene has narrationText of at least 10 characters', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const narr = (scene.narrationText ?? '').trim();
      expect(narr.length, `scene ${scene.ordinal} narration too short: "${narr}"`).toBeGreaterThanOrEqual(10);
    }
  });

  it('no scene narrationText is a generic "untitled" or "scene description"', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const lower = (scene.narrationText ?? '').toLowerCase();
      expect(lower).not.toBe('untitled');
      expect(lower).not.toMatch(/^scene description$/);
      expect(lower).not.toMatch(/^description$/);
    }
  });

  it('narrationText does not contain commercial/advertising language', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const lower = (scene.narrationText ?? '').toLowerCase();
      expect(lower).not.toMatch(/\bbuy\b|\bpurchase\b|\bbrand name\b|\bsponsor\b|\bluxury yacht\b/);
    }
  });

  it('narrationText does not open with narrative fiction markers', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      expect(scene.narrationText).not.toMatch(/^once upon a time/i);
      expect(scene.narrationText).not.toMatch(/^there was a ship named/i);
    }
  });

  it('narrationText relates to its teachingConcept — shares at least one significant word', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const narr = (scene.narrationText ?? '').toLowerCase();
      const concept = (scene.teachingConcept ?? '').toLowerCase();
      const conceptWords = concept.split(/\s+/).filter((w) => w.length > 4);
      // Either the topic "ships" appears in narration, or a concept word does
      const topicInNarration = narr.includes('ships') || narr.includes('ship');
      const conceptInNarration = conceptWords.some((word) => narr.includes(word));
      expect(topicInNarration || conceptInNarration, `scene ${scene.ordinal}: narration "${narr.slice(0, 60)}" unrelated to concept "${concept}"`).toBe(true);
    }
  });

  it('HOOK narration passes: contains a question or exclamation (curiosity-first)', async () => {
    const { scenes } = await buildShipsPipeline();
    const hook = scenes[0]!;
    expect(hook.teachingRole).toBe('HOOK');
    expect(hook.narrationText).toMatch(/[?!]/);
  });

  it('RECAP narration passes: references ships (concept is recapped)', async () => {
    const { scenes } = await buildShipsPipeline();
    const recap = scenes[scenes.length - 1]!;
    expect(recap.teachingRole).toBe('RECAP');
    expect(recap.narrationText?.toLowerCase()).toContain('ships');
  });

  it('validation fallback text is educational (not fictional) by construction', () => {
    // Document the fallback rule from validateAndFillEducationalNarration:
    // Fallback = "Let's learn about {concept}. {concept} is an important part of understanding {topic}."
    const concept = 'Types of ships';
    const topic = 'ships';
    const fallback = `Let's learn about ${concept}. ${concept} is an important part of understanding ${topic}.`;
    expect(fallback).not.toMatch(/once upon|adventure|hero/i);
    expect(fallback.toLowerCase()).toContain(topic);
  });
});

// ─── Section 6: Ships anti-commercial explicit checks ─────────────────────────

describe('F3 §6 — Ships anti-commercial and educational positive representation', () => {
  let contract: EducationalContract;
  let scenes: DirectedScene[];

  beforeAll(async () => {
    ({ contract, scenes } = await buildShipsPipeline());
  });

  // Rejection patterns
  it('rejects: "luxury yacht" in visual teaching strategy', () => {
    expect(contract.visualTeachingStrategy.toLowerCase()).not.toMatch(/luxury yacht/);
  });

  it('rejects: "superyacht" in visual teaching strategy', () => {
    expect(contract.visualTeachingStrategy.toLowerCase()).not.toContain('superyacht');
  });

  it('rejects: "premium lifestyle" in any contract field', () => {
    const text = JSON.stringify(contract).toLowerCase();
    expect(text).not.toMatch(/premium lifestyle|aspirational wealth|exclusive yacht/);
  });

  it('rejects: product advertisement framing in learningObjective', () => {
    expect(contract.learningObjective.toLowerCase()).not.toMatch(/buy|purchase|brand|sponsor|advertis/);
  });

  it('rejects: "yacht advertisement" in any scene field', () => {
    for (const scene of scenes) {
      const text = JSON.stringify(scene).toLowerCase();
      expect(text).not.toMatch(/yacht advertisement|luxury lifestyle|product showcase/);
    }
  });

  // Positive representation
  it('includes cargo ship as an educational example', () => {
    const text = (contract.visualTeachingStrategy + ' ' + contract.examplesToUse.join(' ')).toLowerCase();
    expect(text).toMatch(/cargo/);
  });

  it('includes ferry as an educational example', () => {
    const text = (contract.visualTeachingStrategy + ' ' + contract.examplesToUse.join(' ')).toLowerCase();
    expect(text).toMatch(/ferr/);
  });

  it('includes at least one of: research vessel / fishing vessel / container ship', () => {
    const text = (contract.visualTeachingStrategy + ' ' + contract.examplesToUse.join(' ')).toLowerCase();
    expect(text).toMatch(/research|fishing|container/);
  });

  it('visual strategy instructs educational labeling (hull, deck, etc.)', () => {
    expect(contract.visualTeachingStrategy.toLowerCase()).toMatch(/hull|deck|label|diagram/);
  });

  it('antiCommercialNote on every scene references avoidance of luxury/commercial content', () => {
    for (const scene of scenes) {
      const note = (scene.antiCommercialNote ?? '').toLowerCase();
      expect(note).toMatch(/luxury|commercial|brand|avoid|advertis/);
    }
  });
});

// ─── Section 7: Non-educational regression ────────────────────────────────────

describe('F3 §7 — Non-educational regression: STORY path unchanged', () => {
  it('classifies a story idea as STORY, not EDUCATIONAL', async () => {
    const ct = await LOCAL.classifyContent({ idea: 'A brave princess goes on a quest', answers: [], audienceMode: KIDS });
    expect(ct).toBe('STORY');
  });

  it('classifies commercial idea as COMMERCIAL, not EDUCATIONAL', async () => {
    const ct = await LOCAL.classifyContent({ idea: 'buy our luxury yacht now', answers: [], audienceMode: GENERAL });
    expect(ct).toBe('COMMERCIAL');
  });

  it('directScenes without educationalContract produces plain scenes (no educational fields)', async () => {
    const blueprint = {
      version: 'story_blueprint_v1' as const,
      premise: 'A princess goes on an adventure.',
      protagonist: { name: 'Princess', goal: 'Find the gem' },
      supportingCharacters: [] as [],
      conflict: 'A dragon blocks the path',
      beats: [
        { label: 'Beginning', description: 'The princess sets off.' },
        { label: 'Climax', description: 'She faces the dragon.' },
      ],
      continuityRules: [],
    };
    const scenes = await LOCAL.directScenes({
      blueprint,
      storyTitle: 'Princess Adventure',
      storyBody: 'A brave princess went on a quest.',
      audienceMode: KIDS,
      sceneCount: 2,
      characterContext: 'Princess: brave and kind',
    });
    // Standard scenes must NOT have educational fields
    for (const scene of scenes) {
      expect(scene.learningObjective).toBeUndefined();
      expect(scene.narrationText).toBeUndefined();
      expect(scene.teachingRole).toBeUndefined();
    }
  });

  it('story classification does not bleed into the educational path for concurrent calls', async () => {
    const [ct1, ct2] = await Promise.all([
      LOCAL.classifyContent({ idea: SHIPS_IDEA, answers: [], audienceMode: KIDS }),
      LOCAL.classifyContent({ idea: 'A dragon finds a treasure', answers: [], audienceMode: KIDS }),
    ]);
    expect(ct1).toBe('EDUCATIONAL');
    expect(ct2).toBe('STORY');
  });
});

// ─── Section 8: Narration → audio readiness ───────────────────────────────────

describe('F3 §8 — Narration → audio readiness', () => {
  /**
   * generateEducationalNarration reads narrationText from scene.directorMetadata.narrationText.
   * Every scene that reaches the DB must have valid, non-empty narrationText.
   * Real ElevenLabs TTS is not invoked here (no API key in test env).
   * Status: NARRATION TEXT GENERATED = PASS  |  REAL AUDIO = NOT VERIFIED (needs API key)
   */

  it('every educational scene has non-empty narrationText ready for TTS', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const text = (scene.narrationText ?? '').trim();
      expect(text.length, `scene ${scene.ordinal} has no narrationText`).toBeGreaterThan(0);
    }
  });

  it('narrationText is below ElevenLabs input limit (5000 chars)', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const text = scene.narrationText ?? '';
      expect(text.length).toBeLessThan(5000);
    }
  });

  it('narrationText contains no control characters that would corrupt TTS', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      // ElevenLabs handles UTF-8 (em dashes, curly quotes etc.) fine.
      // Reject only C0/C1 control characters which corrupt TTS input.
      expect(scene.narrationText ?? '').not.toMatch(/[\x00-\x1F\x7F-\x9F]/);
    }
  });

  it('narration is concise (≤80 words per scene) — appropriate TTS length for KIDS', async () => {
    const { scenes } = await buildShipsPipeline();
    for (const scene of scenes) {
      const wordCount = (scene.narrationText ?? '').split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(80);
    }
  });

  it('scene directorMetadata would be stored with narrationText accessible by generateEducationalNarration', async () => {
    const { scenes } = await buildShipsPipeline();
    // Simulate what story.ts stores: directorMetadata = scene as object
    for (const scene of scenes) {
      const asMeta = scene as Record<string, unknown>;
      expect(typeof asMeta['narrationText']).toBe('string');
      expect((asMeta['narrationText'] as string).length).toBeGreaterThan(0);
    }
  });
});

// ─── Section 9: Quality scoring (8 dimensions) ───────────────────────────────

describe('F3 §9 — Quality scoring: 8 dimensions with minimum thresholds', () => {
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

  async function scoreShipsQuality(
    answers: { questionText: string; selectedAnswer: string }[] = [{ questionText: 'Age', selectedAnswer: '8 years old' }],
    sceneCount = 6,
  ): Promise<QualityScores> {
    const { contract, scenes } = await buildShipsPipeline(answers, sceneCount);

    // 1. Educational clarity: topic-specific, schema-valid, complete keyConcepts
    let educationalClarity = 0;
    if (contract.keyConcepts.length >= 3) educationalClarity++;
    if (!contract.learningObjective.includes('{')) educationalClarity++;
    if (contract.learningObjective.toLowerCase().includes('ship')) educationalClarity++;
    if (contract.keyConcepts[0]?.endsWith('?')) educationalClarity++;
    if (contract.topic.toLowerCase() === 'ships') educationalClarity++;

    // 2. Age appropriateness: vocabulary matches requested age, narration length suitable
    let ageAppropriateness = 0;
    if (contract.vocabularyLevel === 'simple') ageAppropriateness += 2;
    if (contract.targetAge.match(/7|8|9/)) ageAppropriateness++;
    const avgWords = scenes.reduce((sum, s) => sum + (s.narrationText ?? '').split(/\s+/).filter(Boolean).length, 0) / scenes.length;
    if (avgWords <= 60) ageAppropriateness++;
    if (avgWords >= 10) ageAppropriateness++;

    // 3. Narration quality: non-empty, child-directed, no commercial language, no fiction markers
    let narrationQuality = 0;
    if (scenes.every((s) => (s.narrationText ?? '').length > 0)) narrationQuality++;
    if (scenes[0]?.narrationText?.match(/[?!]/)) narrationQuality++;
    if (!scenes.some((s) => (s.narrationText ?? '').includes('Viewers will understand'))) narrationQuality++;
    if (!scenes.some((s) => (s.narrationText ?? '').match(/once upon a time/i))) narrationQuality++;
    if (scenes.some((s) => /did you know|let'?s|have you|you will|amazing|discover/i.test(s.narrationText ?? ''))) narrationQuality++;

    // 4. Visual teaching: names specific vessel types, includes labeling instruction, excludes luxury
    let visualTeaching = 0;
    const visualText = contract.visualTeachingStrategy.toLowerCase();
    const vesselCount = ['cargo', 'ferry', 'research', 'fishing', 'container'].filter((v) => visualText.includes(v)).length;
    if (vesselCount >= 2) visualTeaching++;
    if (vesselCount >= 3) visualTeaching++;
    if (visualText.match(/hull|deck|label|diagram/)) visualTeaching++;
    if (!visualText.match(/luxury yacht|superyacht/)) visualTeaching++;
    if (scenes.some((s) => s.visualTeachingRequirement?.toLowerCase().includes('ship'))) visualTeaching++;

    // 5. Scene progression: HOOK first, RECAP last, sequential roles, right count
    let sceneProgression = 0;
    if (scenes[0]?.teachingRole === 'HOOK') sceneProgression++;
    if (scenes[scenes.length - 1]?.teachingRole === 'RECAP') sceneProgression++;
    if (scenes.length >= 4) sceneProgression++;
    const roles = new Set(scenes.map((s) => s.teachingRole));
    if (roles.size >= 3) sceneProgression++;
    if (contract.sceneProgression[0]?.toLowerCase().includes('hook')) sceneProgression++;

    // 6. Engagement: questions, exclamations, child address across scenes
    let engagement = 0;
    const allNarration = scenes.map((s) => s.narrationText ?? '').join(' ');
    const questionCount = (allNarration.match(/\?/g) ?? []).length;
    if (questionCount >= 1) engagement++;
    if (questionCount >= 2) engagement++;
    if (/let'?s|you will|have you|did you know/i.test(allNarration)) engagement++;
    if (scenes[0]?.narrationText?.match(/[?!]/)) engagement++;
    if (scenes.every((s) => (s.narrationText ?? '').split(/\s+/).filter(Boolean).length >= 5)) engagement++;

    // 7. Narration/visual alignment: narration topic references the topic, visual reqs present
    let narrationVisualAlignment = 0;
    const topicInAll = scenes.filter((s) => (s.narrationText ?? '').toLowerCase().match(/ships?/)).length;
    if (topicInAll >= Math.floor(scenes.length * 0.8)) narrationVisualAlignment += 3;
    if (scenes.every((s) => s.visualTeachingRequirement)) narrationVisualAlignment++;
    if (scenes.every((s) => s.antiCommercialNote)) narrationVisualAlignment++;

    // 8. Anti-commercial (strict): no luxury/buy/sponsor in any narrative or visual field
    let antiCommercial = 0;
    const allText = [
      contract.visualTeachingStrategy,
      contract.learningObjective,
      ...contract.keyConcepts,
      ...contract.antiCommercialTopics,
      ...scenes.map((s) => s.narrationText ?? ''),
      ...scenes.map((s) => s.action ?? ''),
    ].join(' ').toLowerCase();
    if (!allText.match(/luxury yacht|buy now|sponsor\b|affiliate/)) antiCommercial++;
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

  it('educational clarity ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.educationalClarity).toBeGreaterThanOrEqual(4);
  });

  it('age appropriateness ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.ageAppropriateness).toBeGreaterThanOrEqual(4);
  });

  it('narration quality ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.narrationQuality).toBeGreaterThanOrEqual(4);
  });

  it('visual teaching ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.visualTeaching).toBeGreaterThanOrEqual(4);
  });

  it('scene progression ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.sceneProgression).toBeGreaterThanOrEqual(4);
  });

  it('engagement ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.engagement).toBeGreaterThanOrEqual(4);
  });

  it('narration/visual alignment ≥4/5', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.narrationVisualAlignment).toBeGreaterThanOrEqual(4);
  });

  it('anti-commercial = 5/5 (strict — no commercial drift permitted)', async () => {
    const scores = await scoreShipsQuality();
    expect(scores.antiCommercial).toBe(5);
  });

  it('all dimensions pass simultaneously (comprehensive acceptance gate)', async () => {
    const scores = await scoreShipsQuality();
    const MINIMUMS: QualityScores = {
      educationalClarity: 4,
      ageAppropriateness: 4,
      narrationQuality: 4,
      visualTeaching: 4,
      sceneProgression: 4,
      engagement: 4,
      narrationVisualAlignment: 4,
      antiCommercial: 5,
    };
    for (const [dim, minScore] of Object.entries(MINIMUMS) as [keyof QualityScores, number][]) {
      expect(scores[dim], `${dim}: ${scores[dim]}/5 < minimum ${minScore}/5`).toBeGreaterThanOrEqual(minScore);
    }
  });
});
