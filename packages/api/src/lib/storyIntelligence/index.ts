export * from './types';
export * from './openAIStoryIntelligenceProvider';
export * from './localStoryIntelligenceProvider';
export { STORY_BLUEPRINT_PROMPT_VERSION } from './prompts/storyBlueprintPrompt';
export { NARRATIVE_ENHANCER_PROMPT_VERSION } from './prompts/narrativeEnhancerPrompt';
export { SCENE_DIRECTOR_PROMPT_VERSION } from './prompts/sceneDirectorPrompt';

import { OpenAIStoryIntelligenceProvider } from './openAIStoryIntelligenceProvider';
import { LocalStoryIntelligenceProvider } from './localStoryIntelligenceProvider';
import type { StoryIntelligenceProvider } from './types';

const _openai = new OpenAIStoryIntelligenceProvider();
const _local = new LocalStoryIntelligenceProvider();

export const storyIntelligenceProvider: StoryIntelligenceProvider =
  _openai.isConfigured ? _openai : _local;
