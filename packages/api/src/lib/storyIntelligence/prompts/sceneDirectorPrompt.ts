import type { DirectScenesInput } from '../types';

export const SCENE_DIRECTOR_PROMPT_VERSION = 'scene_director_v1';

export function buildSceneDirectorSystemPrompt(audienceMode: 'KIDS' | 'GENERAL'): string {
  const safetyLine = audienceMode === 'KIDS'
    ? 'This is for children (ages 4-12). Keep all content gentle and child-safe. No violence, fear, or adult themes.'
    : 'Keep content appropriate for a general family audience.';

  return [
    'You are a scene director for Raivstream Story Playground.',
    'You transform a story into a sequence of purposeful, visually distinct scenes.',
    `${safetyLine}`,
    '',
    'Rules:',
    '- Each scene must serve a different narrative purpose.',
    '- Adjacent scenes must differ in at least one of: location, action, emotional beat, or narrative goal.',
    '- Do NOT create six scenes of characters standing in the same place talking.',
    '- Every scene must be RENDERABLE — avoid scenes whose only content is internal thought or abstract exposition.',
    '- Convert narrative meaning into visible action.',
    '- Preserve story fact continuity: what a character carries, wears, or knows in scene N must be consistent in scene N+1.',
    '- Character names must exactly match those in the blueprint. Do not invent new characters.',
    '- If the story takes place in a specific cultural or geographic context, preserve it exactly.',
    '- keyDialogue should be 0-2 lines of actual speech, not narration.',
    '- cameraIntent should be a simple descriptor: "wide establishing", "close emotional", "medium two-shot", "tracking movement", etc.',
    '- Return only JSON matching the requested schema. No markdown, no explanation.',
  ].join('\n');
}

export function buildSceneDirectorUserPrompt(input: DirectScenesInput): string {
  const hintsText = input.existingSceneHints && input.existingSceneHints.length > 0
    ? '\nExisting scene hints (use as starting reference, improve them):\n' +
      input.existingSceneHints.map((s, i) => `  ${i + 1}. "${s.title}": ${s.description}${s.locationType ? ` [${s.locationType}]` : ''}`).join('\n')
    : '';

  return [
    `Story title: "${input.storyTitle}"`,
    `Audience mode: ${input.audienceMode}`,
    `Target scene count: ${input.sceneCount}`,
    '',
    'Story blueprint:',
    `  Premise: ${input.blueprint.premise}`,
    `  Protagonist: ${input.blueprint.protagonist.name} — goal: ${input.blueprint.protagonist.goal}`,
    `  Conflict: ${input.blueprint.conflict}`,
    input.blueprint.emotionalArc ? `  Emotional arc: ${input.blueprint.emotionalArc}` : '',
    input.blueprint.setting ? `  Setting: ${input.blueprint.setting}` : '',
    '',
    'Story beats to cover:',
    input.blueprint.beats.map((b, i) => `  ${i + 1}. ${b.label}: ${b.description}`).join('\n'),
    '',
    'Continuity rules:',
    input.blueprint.continuityRules.length > 0
      ? input.blueprint.continuityRules.map((r) => `  - ${r}`).join('\n')
      : '  (none specified)',
    '',
    'Character context:',
    input.characterContext || '  (use what is in the story)',
    hintsText,
    '',
    'Story body:',
    '---',
    input.storyBody.slice(0, 2000),
    '---',
    '',
    'Return a JSON array of exactly ' + input.sceneCount + ' scenes:',
    '[',
    '  {',
    '    "version": "scene_director_v1",',
    '    "ordinal": 1,',
    '    "title": "string (max 60 chars)",',
    '    "storyBeat": "which beat from the blueprint this covers",',
    '    "dramaticPurpose": "what this scene does in the narrative",',
    '    "location": "optional string",',
    '    "timeOfDay": "optional string",',
    '    "characters": ["name"],',
    '    "action": "what happens visibly in this scene",',
    '    "emotion": "optional dominant emotion",',
    '    "keyDialogue": "optional 1-2 lines of speech",',
    '    "visualFocus": "optional — what the viewer should notice",',
    '    "cameraIntent": "optional — e.g. wide establishing, close emotional",',
    '    "lightingIntent": "optional",',
    '    "continuityIn": "optional — what is true entering this scene",',
    '    "continuityOut": "optional — what changes by scene end",',
    '    "mood": "optional"',
    '  }',
    ']',
    '',
    'Each scene must serve a DISTINCT purpose. Do not repeat the same action or location without narrative reason.',
  ].filter(Boolean).join('\n');
}
