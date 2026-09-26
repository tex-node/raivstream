import type { ClassifyContentInput } from '../types';
import type { StoryAudienceMode } from '../../storyTextService';

function audienceLine(audienceMode: StoryAudienceMode): string {
  return audienceMode === 'KIDS'
    ? 'Audience: children (ages 3–12).'
    : 'Audience: general / adult.';
}

export function buildContentClassifierSystem(): string {
  return `You are a content-type classifier for a story and video creation platform.

Your job: given a user's idea and any follow-up answers, return the single content type that best describes it.

Available types and their definitions:
- EDUCATIONAL  — the primary purpose is to teach, explain, or inform (facts, concepts, how-things-work, history, science, language, etc.)
- STORY        — the primary purpose is narrative entertainment (fictional characters, plot, drama, adventure, fairy tale, etc.)
- DOCUMENTARY  — factual, real-world subject; observational or investigative in style; not explicitly a lesson
- ENTERTAINMENT — pure entertainment with no clear educational or documentary intent (comedy, music, dance, pop culture, etc.)
- COMMERCIAL   — promotes a product, service, brand, or event
- TRANSFORMATION — personal growth, motivational, self-help, lifestyle change

Classification rules:
1. "Let's talk about X" / "How does X work" / "What is X" / "Learn about X" → EDUCATIONAL
2. "A story about X" / "Once upon a time" / character names + plot → STORY
3. "Documentary about X" / "The life of X (real person)" / "History of X" → DOCUMENTARY
4. Product/brand name as the core subject → COMMERCIAL
5. When ambiguous between EDUCATIONAL and DOCUMENTARY, prefer EDUCATIONAL if there is a clear teaching angle.
6. When the idea mixes story with education (e.g., "story that teaches about ships"), prefer EDUCATIONAL.

Respond with ONLY a JSON object:
{"contentType": "<TYPE>"}

No explanation, no markdown, no extra fields.`;
}

export function buildContentClassifierUser(input: ClassifyContentInput): string {
  const parts: string[] = [`Idea: "${input.idea}"`];
  if (input.answers.length > 0) {
    parts.push(
      'Follow-up answers:\n' +
        input.answers
          .map((a) => `  Q: ${a.questionText}\n  A: ${a.selectedAnswer}`)
          .join('\n'),
    );
  }
  parts.push(audienceLine(input.audienceMode));
  return parts.join('\n\n');
}
