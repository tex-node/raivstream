import type { PlanStoryInput } from '../types';

export const STORY_BLUEPRINT_PROMPT_VERSION = 'story_blueprint_v1';

export function buildBlueprintSystemPrompt(audienceMode: 'KIDS' | 'GENERAL'): string {
  const safetyLine = audienceMode === 'KIDS'
    ? 'This is for children (ages 4-12). Keep conflict gentle. No violence, fear, adult themes, or unsafe content. Favour friendship, curiosity, courage, and kindness.'
    : 'Keep content appropriate for a general family audience. Avoid graphic violence or adult themes.';

  return [
    'You are a story planning assistant for Raivstream Story Playground.',
    'Your job is to turn a user idea and their answers into a structured story blueprint.',
    `${safetyLine}`,
    '',
    'Rules:',
    '- Do NOT assume a villain exists unless the idea implies one.',
    '- Preserve exactly what the user said: names, locations, cultural details, objects.',
    '- Do not normalise a Nigerian or African setting into generic suburbia.',
    '- Keep vocabulary age-appropriate.',
    '- Prefer clear, visual story beats that can become distinct scenes.',
    '- Each beat should suggest a different location or action — avoid six identical beats.',
    '- Return only JSON matching the requested schema. No markdown, no explanation.',
  ].join('\n');
}

export function buildBlueprintUserPrompt(input: PlanStoryInput): string {
  const answersText = input.answers.length > 0
    ? input.answers.map((a) => `  Q: ${a.questionText}\n  A: ${a.selectedAnswer}`).join('\n')
    : '  (none provided)';

  const characterText = input.existingCharacters && input.existingCharacters.length > 0
    ? input.existingCharacters.map((c) => `  - ${c.name}${c.role ? ` (${c.role})` : ''}${c.visualDescription ? `: ${c.visualDescription}` : ''}`).join('\n')
    : '  (none — infer from idea)';

  return [
    `Story idea: "${input.idea}"`,
    `Audience mode: ${input.audienceMode}`,
    '',
    'User answers:',
    answersText,
    '',
    'Known characters (preserve exactly):',
    characterText,
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "version": "story_blueprint_v1",',
    '  "premise": "one sentence",',
    '  "genre": "optional string",',
    '  "tone": "optional string",',
    '  "theme": "optional string",',
    '  "audience": "optional string",',
    '  "protagonist": { "name": "string", "goal": "string", "motivation": "optional string", "flaw": "optional string" },',
    '  "supportingCharacters": [{ "name": "string", "role": "string", "relationship": "optional string" }],',
    '  "setting": "optional string",',
    '  "conflict": "string",',
    '  "stakes": "optional string",',
    '  "emotionalArc": "optional string",',
    '  "beats": [{ "label": "short label", "description": "one sentence" }],',
    '  "continuityRules": ["string"]',
    '}',
    '',
    'beats must have 4 to 6 entries. Each beat must describe a visually distinct moment.',
  ].join('\n');
}
