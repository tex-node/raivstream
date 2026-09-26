import type { PlanEducationInput } from '../types';
import type { StoryAudienceMode } from '../../storyTextService';

function audienceLine(audienceMode: StoryAudienceMode): string {
  return audienceMode === 'KIDS'
    ? 'Audience: children (ages 3–12). Use age-appropriate language and simple concepts.'
    : 'Audience: general / adult. Vocabulary may be moderate to advanced.';
}

export function buildEducationContractSystem(): string {
  return `You are an instructional designer for short educational videos (30–90 seconds per scene).

Your job: given a user's educational idea and their answers, produce a structured Education Content Contract that will guide the entire video generation pipeline — story, narration, visuals, and scene sequencing.

The contract must ensure:
- Every scene teaches something specific (not decorative)
- Narration is mandatory and written for spoken delivery
- Visuals reinforce learning, not commercial aesthetics
- No luxury, aspirational, or product-placement imagery
- Age-appropriate depth and vocabulary

Output ONLY a JSON object with this exact schema (all fields required unless marked optional):

{
  "version": "education_contract_v1",
  "topic": "<The specific subject being taught, e.g. 'how ships float using buoyancy'>",
  "targetAge": "<Age group string, e.g. '3–6 years', '7–12 years', 'all ages'>",
  "learningObjective": "<One clear sentence: what the viewer will understand after watching>",
  "keyConcepts": ["<concept 1>", "<concept 2>", "..."],
  "vocabularyLevel": "<very_simple | simple | moderate | advanced>",
  "explanationStrategy": "<How to explain it: analogy, demonstration, compare-and-contrast, narrative, step-by-step, etc.>",
  "examplesToUse": ["<concrete example 1>", "<concrete example 2>"],
  "visualTeachingStrategy": "<What visuals will reinforce learning: diagrams, real objects, demonstrations, comparisons — never luxury/commercial imagery>",
  "narrationRequired": true,
  "sceneProgression": ["<Scene 1 purpose>", "<Scene 2 purpose>", "..."],
  "recapIncluded": true,
  "antiCommercialTopics": ["<list topics/aesthetics to actively avoid: luxury yachts, brand logos, advertisements, etc.>"]
}

Rules:
- keyConcepts: 2–8 items
- sceneProgression: must have one entry per scene, each describing what is TAUGHT in that scene (not just shown). The FIRST entry must be a HOOK (e.g. "Hook: grab attention with a surprising question — how can a ship as big as a building float?"). The LAST entry must be a RECAP.
- antiCommercialTopics: always include items that block commercial/luxury drift for this specific subject
- narrationRequired is always true for educational content
- recapIncluded is always true
- Do not wrap in markdown. Output raw JSON only.`;
}

function resolveAgeHint(answers: PlanEducationInput['answers'], audienceMode: StoryAudienceMode): string {
  const ageAnswer = answers.find((a) => /age|old|year|grade|level/i.test(a.questionText))?.selectedAnswer ?? '';
  if (/\b(5|6|7|preschool|kindergarten|young(er)?)\b/i.test(ageAnswer)) {
    return 'Target age: 5–7 years. Use very short sentences (3–6 words), concrete nouns, and familiar comparisons. One idea per scene. No technical terms unless immediately explained in 3 words or fewer.';
  }
  if (/\b(8|9|10|second|third|fourth)\b/i.test(ageAnswer)) {
    return 'Target age: 8–10 years. Use short clear sentences. Introduce one new term per scene with a plain-language definition.';
  }
  if (/\b(11|12|13|middle|fifth|sixth|seventh)\b/i.test(ageAnswer)) {
    return 'Target age: 11–13 years. Use moderate vocabulary. Terminology should be defined in context. Multi-step reasoning is appropriate.';
  }
  return audienceLine(audienceMode);
}

export function buildEducationContractUser(input: PlanEducationInput): string {
  const parts: string[] = [`Idea: "${input.idea}"`];
  if (input.answers.length > 0) {
    parts.push(
      'Follow-up answers:\n' +
        input.answers
          .map((a) => `  Q: ${a.questionText}\n  A: ${a.selectedAnswer}`)
          .join('\n'),
    );
  }
  parts.push(resolveAgeHint(input.answers, input.audienceMode));
  parts.push(`Number of scenes: ${input.sceneCount}`);
  parts.push('Scene progression rule: The FIRST scene in sceneProgression MUST be a HOOK — a curiosity-grabbing question or surprising fact that immediately engages the viewer. The LAST scene MUST be a RECAP that reviews what was learned.');
  return parts.join('\n\n');
}
