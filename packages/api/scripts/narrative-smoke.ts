import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(__dirname, '../../../cred/fal_env.txt'), 'utf8');
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}
process.env.STORY_NARRATIVE_ENGINE_ENABLED = 'true';

import { storyTextService } from '../src/lib/storyTextService';
import { isNarrativeEngineEnabled } from '../src/lib/narrativeEngine';

async function main() {
  console.log('enabled:', isNarrativeEngineEnabled());
  const story = await storyTextService.generateStory(
    'A small lantern keeper on a floating island discovers the lighthouse fire is going out and a storm is coming.',
    [
      { questionText: 'Who is the hero?', selectedAnswer: 'A young, brave lantern keeper' },
      { questionText: 'How should the story feel?', selectedAnswer: 'Hopeful and magical' },
      { questionText: 'How should it end?', selectedAnswer: 'A warm, hopeful ending' },
    ],
    'GENERAL',
  );
  console.log('provider:', story.providerMetadata);
  console.log('title:', story.title);
  console.log('mainCharacter:', story.mainCharacterName);
  console.log('scenes:', story.sceneHints.length, story.sceneHints.map((s) => s.title).join(' | '));
  console.log('body (first 400):', story.body.slice(0, 400));
  console.log('body length:', story.body.length);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});