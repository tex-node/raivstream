import { z } from 'zod';
import { styleLabel, stylePromptBlock } from './storyVisualStyles';
import type { StoryAudienceMode } from './storyTextService';

export type PromptEnhancementGenerationType = 'IMAGE' | 'VIDEO';

export type PromptEnhancerInput = {
  basePrompt: string;
  baseNegativePrompt: string;
  maxPromptLength: number;
  maxNegativePromptLength: number;
  scene: {
    title: string;
    description: string;
    locationType?: string | null;
    indoorOutdoor?: string | null;
    mood?: string | null;
    emotion?: string | null;
    cameraStyle?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    environmentMood?: string | null;
    lighting?: string | null;
    scenePace?: string | null;
    characters?: unknown;
  };
  project: {
    title: string;
    originalIdea?: string | null;
    theme?: string | null;
    visualStyle?: string | null;
    tone?: string | null;
    storyDna?: unknown;
  };
  characterIdentity: string;
  selectedVisualStyle?: string | null;
  audienceMode: StoryAudienceMode;
  provider: string;
  generationType: PromptEnhancementGenerationType;
};

export type PromptEnhancerOutput = {
  enhancedPrompt: string;
  negativePrompt: string;
  safetyNotes?: string;
  styleUsed: string;
  providerHints: {
    camera?: string;
    lighting?: string;
    composition?: string;
  };
  provider: 'openai-compatible' | 'deterministic-fallback';
  model?: string;
  fallbackReason?: string;
};

const enhancedPromptSchema = z.object({
  enhancedPrompt: z.string().min(20),
  negativePrompt: z.string().min(1).optional(),
  safetyNotes: z.string().max(500).optional(),
  styleUsed: z.string().min(1).optional(),
  providerHints: z.object({
    camera: z.string().max(240).optional(),
    lighting: z.string().max(240).optional(),
    composition: z.string().max(240).optional(),
  }).default({}),
});

const REQUIRED_NEGATIVE_TERMS = [
  'text overlays',
  'phone UI',
  'social media UI',
  'gallery UI',
  'shot labels',
  '9:16 labels',
  'watermarks',
  'captions',
  'speech bubbles',
  'logos',
];

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in prompt enhancer response');
    return JSON.parse(match[0]);
  }
}

function limitText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const boundary = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(', '), clipped.lastIndexOf(' '));
  return clipped.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength).trim();
}

function mergeNegativePrompt(base: string, additional?: string | null, maxLength = 700) {
  const parts = [...base.split(','), ...(additional ? additional.split(',') : []), ...REQUIRED_NEGATIVE_TERMS]
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return limitText(unique.join(', '), maxLength);
}

function deterministicEnhancement(input: PromptEnhancerInput): PromptEnhancerOutput {
  const styleUsed = styleLabel(input.selectedVisualStyle);
  const styleBlock = stylePromptBlock(input.selectedVisualStyle);
  const compositionAspect = 'vertical 9:16';
  const safety = input.audienceMode === 'KIDS'
    ? 'child-safe, gentle, friendly, no violence, no fear, no adult themes'
    : 'safe, polished, emotionally clear';
  const motion = input.generationType === 'VIDEO'
    ? 'stable subject motion, consistent character identity, no camera shake, simple readable action'
    : 'single strong keyframe, readable silhouette, clear foreground subject';
  const prompt = [
    `Visual style: ${styleBlock}`,
    `Story: "${input.project.title}"`,
    `Scene: ${input.scene.title}`,
    `Action: ${input.scene.description}`,
    input.scene.locationType ? `Location: ${input.scene.locationType}` : undefined,
    input.scene.indoorOutdoor ? `Space: ${input.scene.indoorOutdoor}` : undefined,
    input.scene.mood ? `Mood: ${input.scene.mood}` : undefined,
    input.scene.emotion ? `Directed emotion: ${input.scene.emotion}` : undefined,
    input.scene.cameraStyle ? `Camera: ${input.scene.cameraStyle}` : undefined,
    input.scene.timeOfDay ? `Time of day: ${input.scene.timeOfDay}` : undefined,
    input.scene.weather ? `Weather: ${input.scene.weather}` : undefined,
    input.scene.environmentMood ? `Environment mood: ${input.scene.environmentMood}` : undefined,
    input.scene.lighting ? `Lighting: ${input.scene.lighting}` : undefined,
    input.scene.scenePace ? `Scene pace for future video: ${input.scene.scenePace}` : undefined,
    `Character continuity, preserve exact identity: ${input.characterIdentity}`,
    input.project.storyDna ? `Story DNA, keep this consistent: ${JSON.stringify(input.project.storyDna)}` : undefined,
    input.project.theme ? `Story purpose/theme: ${input.project.theme}` : undefined,
    `Tone and safety: ${safety}`,
    `Provider-ready direction: ${motion}`,
    'No visible words, no UI overlays, no social-media interface, no phone screen, no gallery framing',
    `Composition: ${compositionAspect}, clean composition, clear emotional storytelling, detailed environment without clutter`,
  ].filter(Boolean).join('. ');

  return {
    enhancedPrompt: limitText(prompt, input.maxPromptLength),
    negativePrompt: mergeNegativePrompt(input.baseNegativePrompt, null, input.maxNegativePromptLength),
    safetyNotes: safety,
    styleUsed,
    providerHints: {
      camera: input.generationType === 'VIDEO' ? 'gentle stable camera, simple subject motion' : 'vertical storybook keyframe',
      lighting: 'warm cinematic lighting that matches the selected visual style',
      composition: `${compositionAspect}, clear subject, no text or UI`,
    },
    provider: 'deterministic-fallback',
  };
}

class PromptEnhancerService {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = process.env.OPENAI_PROMPT_ENHANCER_MODEL ?? process.env.OPENAI_TEXT_MODEL ?? process.env.STORY_TEXT_MODEL ?? 'gpt-4o-mini';

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  async enhance(input: PromptEnhancerInput): Promise<PromptEnhancerOutput> {
    if (!this.isConfigured) return deterministicEnhancement(input);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.35,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: input.generationType === 'VIDEO' ? [
                'You write finished, production-ready scene-specific video generation prompts for Raivstream Story Playground.',
                'Return structured JSON only. Do not include markdown.',
                'You are the director, cinematographer and animation director. The prompt must answer: WHO is there, WHERE is everyone (measured distances: "2 meters from", "foreground left", "center background"), WHAT does each character want, WHAT physically happens step by step, HOW does each character perform it (physical behavior not emotion labels), WHERE are they looking, HOW does the camera see it (lens degrees and movement), WHAT lens relationship, HOW does the camera move (direction, distance, speed), HOW does light behave (direction, quality, key/fill), HOW does physics affect movement, WHAT remains continuous, WHERE does the scene end, WHAT should be heard.',
                'Five required blocks:',
                '(1) CHARACTER: @TAG blocks. Image-referenced characters: "@NAME: Already image referenced. Voice: [descriptor]. Voice only." Spend character budget on action and staging, not appearance.',
                '(2) SCENE CONTEXT: STAGING: with measured spatial positions. ACTION: translated into step-by-step physical sequence. EYE LIFE: blink rate tied to state, micro-saccades, live catchlights, gaze target named.',
                '(3) CAMERA: lens in degrees (84deg intimate wide, 47deg documentary, 29deg medium portrait, 18deg close-up). Camera position relative to subject. Movement: push/pull/hold with distance and speed. 9:16 vertical. LIGHTING PRIORITY: Key direction, key quality, subject/background relationship, continuity requirement. Never flat frontal fill.',
                '(4) PHYSICS: all movement has gravity, mass, inertia, weight transfer, follow-through. Cloth and hair lag. No floating, no teleportation, no frictionless feet, no rubbery motion. Every object carries appropriate mass.',
                '(5) PERFORMANCE + SOUND: character objective, obstacle, physical response, gaze response, tactic change expressed in behavior. Then physical sound design: environmental ambience, character sounds tied to action. No invented score.',
                'Hard rules: no em dash (use hyphen). Maximum 4,000 characters. No fabricated continuity from missing adjacent scenes. Single continuous take unless action demands cuts.',
                'Preserve character identity exactly. Preserve scene intent.',
                'Do not add new characters. Do not add text overlays, UI, phone screens, gallery framing, watermarks.',
                'Keep child-safe tone for KIDS audience.',
              ].join(' ') : [
                'You improve internal AI media generation prompts for Raivstream Story Playground.',
                'Return structured JSON only. Do not include markdown.',
                'Preserve character identity exactly and preserve scene intent.',
                'Do not add new characters unless requested.',
                'Avoid text on screen, UI overlays, phone-screen framing, gallery framing, social-media interfaces, watermarks, labels, or captions.',
                'Keep the same child-safe tone. Make the prompt visually rich and provider-ready.',
              ].join(' '),
            },
            {
              role: 'user',
              content: [
                `Generation type: ${input.generationType}`,
                `Provider/model: ${input.provider}`,
                `Audience mode: ${input.audienceMode}`,
                `Max prompt length: ${input.maxPromptLength}`,
                `Selected style label: ${styleLabel(input.selectedVisualStyle)}`,
                `Selected style block: ${stylePromptBlock(input.selectedVisualStyle)}`,
                `Character identity to preserve exactly: ${input.characterIdentity}`,
                'Character identity includes appearance, personality, goal, fear, relationships, evolution stage, and consistency rules. Preserve unchanged traits exactly across scenes.',
                'The scene JSON may include director controls: emotion, cameraStyle, timeOfDay, weather, environmentMood, lighting, and scenePace. Incorporate them naturally and explicitly into the prompt without exposing control labels in the generated image.',
                `Internal Story DNA: ${JSON.stringify(input.project.storyDna ?? {})}`,
                `Scene JSON: ${JSON.stringify(input.scene)}`,
                `Project JSON: ${JSON.stringify(input.project)}`,
                `Base prompt: ${input.basePrompt}`,
                `Base negative prompt: ${input.baseNegativePrompt}`,
                'Return JSON: {"enhancedPrompt":"...","negativePrompt":"...","styleUsed":"...","providerHints":{"camera":"...","lighting":"...","composition":"..."},"safetyNotes":"..."}',
              ].join('\n'),
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Prompt enhancer failed with ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('Prompt enhancer returned no content');
      const parsed = enhancedPromptSchema.parse(parseJsonObject(content));
      return {
        enhancedPrompt: limitText(parsed.enhancedPrompt, input.maxPromptLength),
        negativePrompt: mergeNegativePrompt(input.baseNegativePrompt, parsed.negativePrompt, input.maxNegativePromptLength),
        safetyNotes: parsed.safetyNotes,
        styleUsed: parsed.styleUsed ?? styleLabel(input.selectedVisualStyle),
        providerHints: parsed.providerHints,
        provider: 'openai-compatible',
        model: this.model,
      };
    } catch (error) {
      console.warn('[promptEnhancerService] deterministic fallback:', error);
      return { ...deterministicEnhancement(input), fallbackReason: error instanceof Error ? error.message : 'Prompt enhancer failed' };
    }
  }
}

export const promptEnhancerService = new PromptEnhancerService();
export { REQUIRED_NEGATIVE_TERMS };
