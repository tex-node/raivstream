import { describe, it, expect } from 'vitest';
import { composeScenePromptText } from '../../../routers/story';

const PROSE =
  'Sneaky Hopper, same look every scene: Gray rabbit with bright chestnut-colored eyes, long ears, powerful hind legs built for jumping, consistency rules: keep fur or hair, eye color, clothing, backpack, accessories, height, and species unchanged';

function sceneWith(identityRefsEnabled: boolean) {
  return {
    id: 'scene-1',
    projectId: 'proj-1',
    orderIndex: 1,
    title: 'The Great Escape',
    description: 'Sneaky Hopper pushes a loose stone and hops into the tall grass.',
    characters: ['Sneaky Hopper'],
    locationType: 'Animal Prison',
    mood: 'Adventurous',
    directorMetadata: null,
    chapter: { blueprint: null },
    project: {
      title: 'Sneaky Hopper and the Magical Map',
      audienceMode: 'KIDS',
      identityRefsEnabled,
      characterMemory: [
        {
          id: 'char-1',
          name: 'Sneaky Hopper',
          species: 'rabbit',
          age: 'young adult',
          gender: 'male',
          visualDescription: 'Gray rabbit with bright chestnut-colored eyes, long ears, powerful hind legs built for jumping',
          favoriteExpression: null,
          walkingStyle: null,
          details: null,
          lockedIdentityBlock: PROSE,
          approvedReferenceAssetId: 'ref-1',
        },
      ],
    },
  };
}

function compose(identityRefsEnabled: boolean): string {
  const out = composeScenePromptText({
    scene: sceneWith(identityRefsEnabled) as never,
    provider: 'FLUX',
    outputType: 'IMAGE',
    audienceMode: 'KIDS',
  } as never);
  return (out as { prompt: string }).prompt;
}

/**
 * The flag is read from `scene.project`, which the caller builds with an explicit
 * Prisma `select`. When `identityRefsEnabled` was missing from that select the
 * composer read `undefined`, silently took the text path, and an 80-credit
 * regeneration produced a control image while the database said the flag was on.
 *
 * This test asserts the flag's *effect on the prompt it gates*, which is the only
 * place the leak is observable.
 */
describe('identityRefsEnabled flag is consumed by the composer', () => {
  it('flag off: the composed prompt carries the identity prose', () => {
    const prompt = compose(false);
    expect(prompt).toContain('Gray rabbit');
    expect(prompt).not.toContain('reference image 1 is Sneaky Hopper');
  });

  it('flag on: the composed prompt drops the prose and binds by reference position', () => {
    const prompt = compose(true);
    expect(prompt).not.toContain('Gray rabbit');
    expect(prompt).not.toContain('consistency rules');
    expect(prompt).toContain('the character in reference image 1 is Sneaky Hopper');
  });
});
