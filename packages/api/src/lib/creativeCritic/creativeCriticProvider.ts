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
                  'Return JSON: {"overallScore":90,"scores":{"characterIdentity":90,"continuity":90,"composition":90,"lighting":90,"emotion":90,"visualStyle":90,"environment":90,"storyAlignment":90,"sceneClarity":90,"technicalQuality":90},"strengths":["..."],"issues":[{"category":"CHARACTER","severity":"LOW","description":"..."}],"improvementPlan":{"character":["..."],"composition":["..."],"lighting":["..."],"emotion":["..."],"style":["..."],"environment":["..."],"story":["..."],"technical":["..."]},"recommendation":"APPROVE","confidence":90}',
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
    const parsed = creativeCriticResultSchema.parse(parseJsonObject(content));
    return {
      provider: 'openai-compatible',
      model: this.model,
      result: normaliseCriticResult(parsed),
    };
  }
}

export const creativeCriticProvider = new OpenAICompatibleCreativeCriticProvider();
