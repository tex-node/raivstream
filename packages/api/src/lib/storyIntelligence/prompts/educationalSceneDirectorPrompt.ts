import type { DirectScenesInput, EducationalContract } from '../types';
import type { StoryAudienceMode } from '../../storyTextService';

export const EDUCATIONAL_SCENE_DIRECTOR_PROMPT_VERSION = 'educational_scene_director_v1';

function audienceSafety(audienceMode: StoryAudienceMode): string {
  return audienceMode === 'KIDS'
    ? 'Audience: children (ages 3–12). Use simple words, short sentences, gentle friendly visuals only. No violence, fear, or adult themes.'
    : 'Audience: general. Use age-appropriate vocabulary and clear explanations.';
}

function vocabularyGuidance(level: EducationalContract['vocabularyLevel']): string {
  switch (level) {
    case 'very_simple': return 'Use very short sentences (5–8 words), concrete nouns, everyday words only. No technical terms unless immediately explained with a simpler word.';
    case 'simple': return 'Use short clear sentences, basic vocabulary. Introduce one new term per scene with a simple definition.';
    case 'moderate': return 'Use clear sentences, moderate vocabulary. Technical terms should be defined in context.';
    case 'advanced': return 'Use precise terminology appropriate for the subject. Assume basic prior knowledge of the topic area.';
  }
}

export function buildEducationalSceneDirectorSystem(
  audienceMode: StoryAudienceMode,
  contract: EducationalContract,
): string {
  const antiCommercial = contract.antiCommercialTopics.length > 0
    ? `\nANTI-COMMERCIAL REQUIREMENT:\nThis is an educational video, not an advertisement.\nDo NOT use: ${contract.antiCommercialTopics.join(', ')}.\nDo not frame ${contract.topic} as a product to admire, purchase, promote, or aspire to.\nDo not introduce luxury, premium, advertising, brand, sales, or promotional framing unless the educational objective explicitly requires it.`
    : '';

  return [
    'You are an educational scene director for short educational videos.',
    `Topic: ${contract.topic}`,
    `Learning objective: ${contract.learningObjective}`,
    audienceSafety(audienceMode),
    '',
    'CRITICAL RULE: You are designing EDUCATIONAL scenes, not advertisements or story entertainment.',
    'Every scene MUST teach something specific. Aesthetic quality serves learning; it does not replace it.',
    '',
    'Educational scene priority order:',
    '  1. Learning objective (what the viewer understands after this scene)',
    '  2. Factual clarity (the concept is correct and unambiguous)',
    '  3. Age appropriateness (vocabulary, complexity, examples)',
    '  4. Visual evidence (the visual DEMONSTRATES the concept)',
    '  5. Narration (the narration TEACHES, not merely describes what looks attractive)',
    '  6. Engagement (visually interesting, colorful, memorable)',
    '  7. Cinematic quality (beautiful when possible, but never at the expense of teaching)',
    '',
    vocabularyGuidance(contract.vocabularyLevel),
    antiCommercial,
    '',
    'Narration rule: Every scene requires a narration script.',
    'BAD narration: "Look at this amazing ship sailing across the beautiful ocean!"',
    `GOOD narration (teaching ${contract.topic}): State what the viewer is seeing AND why it matters educationally. Use the assigned vocabulary level.`,
    '',
    'Return ONLY a JSON array. No markdown, no explanation.',
  ].filter(Boolean).join('\n');
}

export function buildEducationalSceneDirectorUser(
  input: DirectScenesInput,
  contract: EducationalContract,
): string {
  const progressionLines = contract.sceneProgression
    .slice(0, input.sceneCount)
    .map((purpose, i) => `  Scene ${i + 1}: ${purpose}`)
    .join('\n');

  const keyConcepts = contract.keyConcepts.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
  const examples = contract.examplesToUse.length > 0
    ? `Examples to use:\n${contract.examplesToUse.map((e) => `  - ${e}`).join('\n')}`
    : '';

  return [
    `Educational topic: "${contract.topic}"`,
    `Learning objective: ${contract.learningObjective}`,
    `Target age: ${contract.targetAge}`,
    `Vocabulary level: ${contract.vocabularyLevel}`,
    `Explanation strategy: ${contract.explanationStrategy}`,
    '',
    `Key concepts to cover:\n${keyConcepts}`,
    examples,
    '',
    `Visual teaching strategy: ${contract.visualTeachingStrategy}`,
    '',
    `Scene progression plan (${input.sceneCount} scenes):\n${progressionLines}`,
    '',
    `Story title: "${input.storyTitle}"`,
    `Story body (use as factual reference only):\n---\n${input.storyBody.slice(0, 1500)}\n---`,
    '',
    'Return a JSON array of exactly ' + input.sceneCount + ' educational scenes:',
    '[',
    '  {',
    '    "version": "scene_director_v1",',
    '    "ordinal": 1,',
    '    "title": "string (max 60 chars, describe what is TAUGHT)",',
    '    "storyBeat": "which concept from the progression this covers",',
    '    "dramaticPurpose": "what educational objective this scene achieves",',
    '    "learningObjective": "what the viewer understands after this scene",',
    '    "teachingConcept": "the specific fact or concept being taught",',
    '    "teachingRole": "INTRODUCTION | EXPLANATION | EXAMPLE | COMPARISON | DEMONSTRATION | REINFORCEMENT | RECAP",',
    '    "visualTeachingRequirement": "what must be visible to actually TEACH the concept (not just look nice)",',
    '    "narrationText": "1-3 sentences of educational narration at the assigned vocabulary level — must TEACH, not just describe",',
    '    "antiCommercialNote": "brief note on how this scene avoids commercial/luxury framing",',
    '    "location": "optional — educational setting appropriate for the concept",',
    '    "timeOfDay": "optional",',
    '    "characters": [],',
    '    "action": "what is SHOWN to illustrate the concept",',
    '    "emotion": "optional — curiosity, wonder, surprise, satisfaction",',
    '    "visualFocus": "what the viewer\'s eye should be drawn to for maximum learning",',
    '    "cameraIntent": "optional — e.g. wide establishing, close concept detail, medium demonstration",',
    '    "lightingIntent": "optional — clear, bright, educational",',
    '    "mood": "optional — curious, engaged, playful"',
    '  }',
    ']',
    '',
    `Each scene must TEACH one of the key concepts. Do not repeat the same concept unless adding depth.`,
    `Narration must match vocabulary level: ${contract.vocabularyLevel}.`,
    `Visual must DEMONSTRATE the concept, not just illustrate the topic aesthetically.`,
  ].filter(Boolean).join('\n');
}
