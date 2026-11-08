import { describe, expect, it } from 'vitest';
import { deriveEducationalSceneProgression, deriveEducationalScenes, educationalSceneIsFragment } from '../educationalSceneDerivation';
import { deriveScenesFromStory } from '../sceneDerivation';
import type { EducationalContract } from '../../storyIntelligence/types';

/**
 * Educational scenes derive from the lesson (2026-11-08).
 *
 * THE DEFECT: `educationalSceneProgression` returned a fixed seven-entry list - Hook, Introduction,
 * Core concept, Example, Second concept, Application, Recap - truncated by `slice(0, count)`. Every
 * lesson produced scenes from that list, whatever the lesson was about. It looked fine because the
 * scenes had titles and purposes; none of them were this lesson's.
 *
 * The traceability test below is the one that fails against the template, exactly as it caught the
 * story derivation including a chapter summary as if it were a beat.
 */

function contract(overrides: Partial<EducationalContract> = {}): EducationalContract {
  return {
    version: 'education_contract_v1',
    topic: 'Volcanoes',
    targetAge: '8-10',
    learningObjective: 'Understand how a volcano erupts and why.',
    keyConcepts: ['Magma is melted rock', 'Pressure builds underground', 'Lava flows and cools'],
    vocabularyLevel: 'simple',
    explanationStrategy: 'Start with what children can see.',
    examplesToUse: ['A shaken fizzy bottle'],
    visualTeachingStrategy: 'Cutaway cross-sections',
    narrationRequired: true,
    sceneProgression: ['Hook', 'Introduction', 'Core concept', 'Example', 'Application', 'Recap'],
    recapIncluded: true,
    antiCommercialTopics: [],
    ...overrides,
  };
}

const TEMPLATE_LABELS = ['hook', 'introduction', 'core concept', 'second concept', 'application'];

describe('scenes come from the lesson, not the template', () => {
  const scenes = deriveEducationalScenes(contract());
  const titles = scenes.map((scene) => scene.title.toLowerCase()).join(' | ');

  it('produces none of the template labels', () => {
    for (const label of TEMPLATE_LABELS) expect(titles).not.toContain(label);
  });

  it('titles are traceable to the contract key concepts', () => {
    for (const concept of contract().keyConcepts) {
      const bare = concept.slice(0, 12).toLowerCase();
      expect(titles).toContain(bare);
    }
  });

  it('one scene per concept, plus the recap the contract says it has', () => {
    expect(scenes).toHaveLength(contract().keyConcepts.length + 1);
  });

  it('an example joins its concept rather than becoming its own slot', () => {
    expect(scenes[0]!.description).toContain('Magma is melted rock');
    expect(scenes[0]!.description).toContain('fizzy bottle');
  });

  it('no recap scene when the contract says there is no recap', () => {
    const noRecap = deriveEducationalScenes(contract({ recapIncluded: false }));
    expect(noRecap).toHaveLength(contract().keyConcepts.length);
    expect(noRecap.map((scene) => scene.title.toLowerCase()).join(' ')).not.toContain('recap');
  });
});

describe('short lessons are short, long lessons are long', () => {
  it('a two-concept lesson produces two scenes, not seven', () => {
    const short = deriveEducationalScenes(
      contract({ topic: 'Lava', keyConcepts: ['Lava is melted rock', 'Lava cools into stone'], examplesToUse: [], recapIncluded: false }),
    );
    expect(short).toHaveLength(2);
  });

  it('a ten-concept lesson produces ten, not the old seven-slot ceiling', () => {
    const concepts = Array.from({ length: 10 }, (_, i) => `Concept number ${i + 1} explained`);
    const long = deriveEducationalScenes(contract({ keyConcepts: concepts, recapIncluded: false }));
    expect(long).toHaveLength(10);
    expect(long.length).toBeGreaterThan(7);
  });
});

describe('no gaps: every educational scene is whole and the lesson concludes', () => {
  it('zero fragments by isFragment', () => {
    for (const scene of deriveEducationalScenes(contract())) {
      expect(educationalSceneIsFragment(scene)).toBe(false);
    }
  });

  it('the ending is present when the contract includes a recap', () => {
    const scenes = deriveEducationalScenes(contract());
    expect(scenes[scenes.length - 1]!.description.toLowerCase()).toContain('recap');
  });

  it('the progression handed to the director is the derived one', () => {
    const progression = deriveEducationalSceneProgression(contract());
    expect(progression).toHaveLength(deriveEducationalScenes(contract()).length);
    expect(progression[0]).toContain('Magma is melted rock');
  });
});

describe('the story derivation is unaffected', () => {
  it('still derives one scene per beat from the chapter body', () => {
    const scenes = deriveScenesFromStory({
      title: 'Story',
      audienceMode: 'GENERAL',
      chapters: [{ title: 'One', summary: 'A summary, not a beat.', body: 'The keeper climbed the stairs. He found a bird.' }],
    });
    expect(scenes).toHaveLength(2);
    expect(scenes[0]!.title.toLowerCase()).toContain('the keeper climbed');
  });
});
