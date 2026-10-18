/**
 * Procedures expensive enough to warrant their own per-user budget on top of
 * the default authenticated bucket. Every entry does real provider work
 * (generation, TTS, music, FFmpeg export) and costs money.
 */
export const EXPENSIVE_PROCEDURES: ReadonlySet<string> = new Set([
  'generation.create',
  'generation.retry',
  'story.generateStory',
  'story.continueStory',
  'story.generateScenes',
  'story.generateCharacterBible',
  'story.generateCharacterReference',
  'story.startBatchGeneration',
  'story.generateSceneImage',
  'story.generateSceneVideo',
  'story.generateSceneShotClips',
  'story.generateEducationalNarration',
  'story.generateStoryNarration',
  'story.generateStoryMusic',
  'story.requestStoryVideoExport',
  'director.compose',
  'creative.production.produce',
  'creative.review.run',
]);

export function isExpensive(path: string): boolean {
  return EXPENSIVE_PROCEDURES.has(path);
}
