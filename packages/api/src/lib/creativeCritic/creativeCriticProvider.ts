import {
  type CreativeCriticInput,
  type CreativeCriticProviderResult,
  creativeCriticResultSchema,
  parseJsonObject,
} from './criticTypes';
import { normaliseCriticResult } from './qualityScorer';

function configuredModel() {
  return process.env.CREATIVE_CRITIC_MODEL
    ?? process.env.OPENAI_VISION_MODEL
    ?? process.env.OPENAI_TEXT_MODEL
    ?? 'gpt-4o-mini';
}

function publicSafeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2).slice(0, 5000);
}

export class CreativeCriticUnavailableError extends Error {
  constructor(message = 'Creative critic provider is not configured') {
    super(message);
    this.name = 'CreativeCriticUnavailableError';
  }
}

class OpenAICompatibleCreativeCriticProvider {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = configuredModel();

  get isConfigured() {
    return process.env.CREATIVE_CRITIC_ENABLED === 'false' ? false : Boolean(this.apiKey);
  }

  async evaluate(input: CreativeCriticInput): Promise<CreativeCriticProviderResult> {
    if (!this.isConfigured) throw new CreativeCriticUnavailableError();

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are Raivstream Creative Critic, an experienced child-safe art director for story images.',
              'Evaluate the provided image against the internal creative specification, story DNA, character director, scene director, and provider metadata.',
              'Do not merely check whether the image exists. Decide whether it is suitable for the intended story.',
              'Return JSON only matching the requested schema. Do not include markdown.',
              'Scores must be 0 to 100. Do not expose private data or raw prompts in comments.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Evaluate this generated story image.',
                  'Return a JSON object with exactly these keys and no others:',
                  '- overallScore: integer 0-100, your overall judgement of this image as a story illustration',
                  '- scores: object with integer 0-100 values for exactly these keys: characterIdentity, continuity, composition, lighting, emotion, visualStyle, environment, storyAlignment, sceneClarity, technicalQuality',
                  '- strengths: array of 1-3 short strings describing what works',
                  '- issues: array of {category: "CHARACTER" | "CONTINUITY" | "COMPOSITION" | "LIGHTING" | "EMOTION" | "STYLE" | "ENVIRONMENT" | "STORY" | "CLARITY" | "TECHNICAL", severity: "LOW" | "MEDIUM" | "HIGH", description: string}',
                  '- improvementPlan: object with string-array values for exactly: character, composition, lighting, emotion, style, environment, story, technical',
                  '- recommendation: exactly one of "APPROVE" | "SUGGEST_REFINEMENT" | "REGENERATE"',
                  '- confidence: integer 0-100',
                  'Score what you actually observe in this specific image. The key names above are a schema, not values: do not copy them as numbers, and do not default every dimension to the same score unless the image genuinely merits it.',
                  'An image with a wrong or drifting character, visible text or UI overlays, distorted anatomy, duplicated characters, or the wrong aspect ratio must score low on the dimensions it affects, and must not be recommended for approval.',
                  `Creative specification: ${publicSafeJson(input.creativeSpecification)}`,
                  `Story DNA: ${publicSafeJson(input.storyDna)}`,
                  `Visual DNA: ${publicSafeJson(input.visualDna)}`,
                  `Character Director: ${publicSafeJson(input.characterDirector)}`,
                  `Scene Director: ${publicSafeJson(input.sceneDirector)}`,
                  `Selected visual style: ${input.selectedVisualStyle ?? 'unknown'}`,
                  `Previous active scene asset: ${publicSafeJson(input.previousActiveSceneAsset)}`,
                  `Previous scene creative specification: ${publicSafeJson(input.previousSceneCreativeSpecification)}`,
                  `Provider metadata: ${publicSafeJson(input.providerMetadata)}`,
                  `Generation metadata: ${publicSafeJson(input.generationMetadata)}`,
                  'Check character identity, continuity, composition, lighting, emotion, style, environment, story alignment, scene clarity, and technical quality.',
                  'Flag unwanted text, UI overlays, watermarks, distorted anatomy, wrong aspect ratio, duplicated characters, and character drift.',
                ].join('\n'),
              },
              { type: 'image_url', image_url: { url: input.assetUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Creative critic provider failed with ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Creative critic provider returned no content');
    // Models drift on casing even when the schema is explicit ('continuity' for
    // 'CONTINUITY'), and a rejected response loses a whole run. Normalise the
    // enumerated fields before validation rather than punishing the model for it.
    const raw = parseJsonObject(content) as Record<string, unknown>;
    const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v);
    const normalised = {
      ...raw,
      recommendation: upper(raw.recommendation),
      issues: Array.isArray(raw.issues)
        ? (raw.issues as Array<Record<string, unknown>>).map((issue) => ({
            ...issue,
            category: upper(issue.category),
            severity: upper(issue.severity),
          }))
        : raw.issues,
    };
    const parsed = creativeCriticResultSchema.parse(normalised);
    return {
      provider: 'openai-compatible',
      model: this.model,
      result: normaliseCriticResult(parsed),
    };
  }
}

export const creativeCriticProvider = new OpenAICompatibleCreativeCriticProvider();
