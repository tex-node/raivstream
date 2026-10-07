// Inspection helper — run with: pnpm vitest run src/routers/__tests__/auditPrompts.ts
// NOT a real test — print-only for inspection. Delete when done.

import { describe, expect, it } from 'vitest';
import { composeScenePromptText } from '../story';

function scene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene-audit',
    title: overrides.title ?? 'The Scene',
    description: overrides.description ?? 'A child finds a glowing flower in a peaceful garden.',
    locationType: overrides.locationType ?? 'garden',
    indoorOutdoor: overrides.indoorOutdoor ?? 'outdoor',
    mood: overrides.mood ?? 'wonder',
    cameraStyle: overrides.cameraStyle ?? 'MEDIUM_SHOT',
    timeOfDay: null,
    weather: null,
    emotion: null,
    environmentMood: null,
    lighting: null,
    scenePace: null,
    characters: overrides.characters ?? [],
    directorMetadata: overrides.directorMetadata ?? null,
    chapter: { blueprint: null },
    project: {
      id: 'proj-audit',
      title: overrides.projectTitle ?? 'Audit Story',
      audienceMode: overrides.audienceMode ?? 'GENERAL',
      visualStyle: 'CINEMATIC_FANTASY',
      theme: 'adventure',
      storyDna: null,
      characterMemory: [],
    },
    ...overrides,
  };
}

function edu(concept: string, desc: string, loc: string, audienceMode = 'GENERAL') {
  return scene({
    title: `${concept} Demo`,
    description: desc,
    locationType: loc,
    audienceMode,
    directorMetadata: {
      learningObjective: `Understand ${concept}`,
      teachingConcept: concept,
      visualTeachingRequirement: `Show ${concept} clearly.`,
    },
  });
}

const cases: Array<{ label: string; sc: any; mode: 'GENERAL' | 'KIDS' }> = [
  {
    label: '1. GENERAL discovery',
    sc: scene({ description: 'Sam finds an ancient compass buried under a mossy stone.', locationType: 'forest', characters: [{ name: 'Sam' }] }),
    mode: 'GENERAL',
  },
  {
    label: '2. GENERAL running',
    sc: scene({ description: 'Sam runs across the courtyard toward the iron gate.', locationType: 'courtyard', characters: [{ name: 'Sam' }] }),
    mode: 'GENERAL',
  },
  {
    label: '3. GENERAL sprint/dash',
    sc: scene({ description: 'Sam sprints across the open plaza toward the finish line.', locationType: 'plaza', characters: [{ name: 'Sam' }] }),
    mode: 'GENERAL',
  },
  {
    label: '4. GENERAL two-character (short names)',
    sc: scene({ description: 'Sam and Jordan face each other across the room.', locationType: 'classroom', characters: [{ name: 'Sam' }, { name: 'Jordan' }] }),
    mode: 'GENERAL',
  },
  {
    label: '5. GENERAL long-name two-character',
    sc: scene({ description: 'Alexander and Josephine face each other across the room.', locationType: 'library', characters: [{ name: 'Alexander' }, { name: 'Josephine' }] }),
    mode: 'GENERAL',
  },
  {
    label: '6. GENERAL educational gravity',
    sc: edu('gravity', 'A child releases an apple from a tree branch. It falls to the ground.', 'orchard'),
    mode: 'GENERAL',
  },
  {
    label: '7. GENERAL educational buoyancy',
    sc: edu('buoyancy', 'A child lowers a wooden block into a basin of water to see if it floats.', 'classroom'),
    mode: 'GENERAL',
  },
  {
    label: '8. GENERAL object interaction',
    sc: scene({ description: 'Sam picks up a heavy wooden crate and carries it to the shelf.', locationType: 'warehouse', characters: [{ name: 'Sam' }] }),
    mode: 'GENERAL',
  },
  {
    label: '9. KIDS discovery',
    sc: scene({ description: 'Mia finds a colorful feather near the pond.', locationType: 'park', characters: [{ name: 'Mia' }], audienceMode: 'KIDS' }),
    mode: 'KIDS',
  },
  {
    label: '10. KIDS running',
    sc: scene({ description: 'Mia runs through the garden path to reach her friend.', locationType: 'garden', characters: [{ name: 'Mia' }], audienceMode: 'KIDS' }),
    mode: 'KIDS',
  },
  {
    label: '11. KIDS two-character',
    sc: scene({ description: 'Amara and Lena share a secret in the park.', locationType: 'park', characters: [{ name: 'Amara' }, { name: 'Lena' }], audienceMode: 'KIDS' }),
    mode: 'KIDS',
  },
  {
    label: '12. KIDS educational magnetism',
    sc: edu('magnetism', 'A child holds a magnet near iron filings on a paper and watches them move.', 'classroom', 'KIDS'),
    mode: 'KIDS',
  },
];

describe('AUDIT: 12 representative prompts', () => {
  for (const c of cases) {
    it(c.label, () => {
      const result = composeScenePromptText({
        scene: c.sc as any,
        outputType: 'SHORT_VIDEO',
        provider: 'H3_MAX',
        audienceMode: c.mode,
      });
      const cutLines = result.prompt.split('\n').filter((l: string) => l.startsWith('CUT - '));
      console.log(`\n${'='.repeat(70)}`);
      console.log(`[${c.label}]`);
      console.log(`  chars: ${result.prompt.length}  cuts: ${cutLines.length}  budget_ok: ${result.prompt.length <= 1400}`);
      console.log(result.prompt);
      // actual assertions
      expect(result.prompt.length).toBeLessThanOrEqual(1400);
      expect(cutLines.length).toBeGreaterThanOrEqual(3);
    });
  }
});
