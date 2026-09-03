import { z } from 'zod';
import {
  type StoryIntelligenceProvider,
  type PlanStoryInput,
  type EnhanceNarrativeInput,
  type DirectScenesInput,
  type StoryBlueprint,
  type DirectedScene,
  StoryIntelligenceError,
  storyBlueprintSchema,
  directedSceneSchema,
} from './types';
import {
  buildBlueprintSystemPrompt,
  buildBlueprintUserPrompt,
} from './prompts/storyBlueprintPrompt';
import {
  buildEnhancerSystemPrompt,
  buildEnhancerUserPrompt,
} from './prompts/narrativeEnhancerPrompt';
import {
  buildSceneDirectorSystemPrompt,
  buildSceneDirectorUserPrompt,
} from './prompts/sceneDirectorPrompt';

const TIMEOUT_MS = 45_000;

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* fall through */ } }
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ } }
  throw new Error('No JSON found in provider response');
}

export class OpenAIStoryIntelligenceProvider implements StoryIntelligenceProvider {
  readonly name = 'openai-compatible';
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = process.env.OPENAI_TEXT_MODEL ?? process.env.STORY_TEXT_MODEL ?? 'gpt-4o-mini';

  get isConfigured() { return Boolean(this.apiKey); }

  private async complete(
    system: string,
    user: string,
    opts: { temperature?: number; responseFormat?: 'json_object' | 'text' } = {},
  ): Promise<string> {
    if (!this.apiKey) {
      throw new StoryIntelligenceError('STORY_INTELLIGENCE_UNAVAILABLE', 'OpenAI API key not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: opts.temperature ?? 0.65,
          ...(opts.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new StoryIntelligenceError(
          'STORY_BLUEPRINT_PROVIDER_FAILED',
          `Story intelligence provider returned ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new StoryIntelligenceError('STORY_BLUEPRINT_PROVIDER_FAILED', 'Provider returned no content');
      }
      return content;
    } catch (error) {
      if (error instanceof StoryIntelligenceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new StoryIntelligenceError('STORY_INTELLIGENCE_TIMEOUT', `Provider timed out after ${TIMEOUT_MS}ms`);
      }
      throw new StoryIntelligenceError('STORY_BLUEPRINT_PROVIDER_FAILED', 'Provider call failed', error);
    } finally {
      clearTimeout(timer);
    }
  }

  async planStory(input: PlanStoryInput): Promise<StoryBlueprint> {
    const content = await this.complete(
      buildBlueprintSystemPrompt(input.audienceMode),
      buildBlueprintUserPrompt(input),
      { temperature: 0.7, responseFormat: 'json_object' },
    );

    let parsed: unknown;
    try {
      parsed = parseJsonObject(content);
    } catch (error) {
      // one repair attempt: ask the model to fix its output
      const repairContent = await this.complete(
        'Fix the following malformed JSON to exactly match the story blueprint schema. Return only valid JSON.',
        `Malformed response:\n${content.slice(0, 2000)}`,
        { temperature: 0, responseFormat: 'json_object' },
      ).catch(() => { throw new StoryIntelligenceError('STORY_BLUEPRINT_INVALID', 'Blueprint JSON repair failed', error); });
      parsed = parseJsonObject(repairContent);
    }

    const withVersion = typeof parsed === 'object' && parsed !== null
      ? { ...parsed as Record<string, unknown>, version: 'story_blueprint_v1' }
      : parsed;

    const result = storyBlueprintSchema.safeParse(withVersion);
    if (!result.success) {
      throw new StoryIntelligenceError(
        'STORY_BLUEPRINT_INVALID',
        `Blueprint schema validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    return result.data;
  }

  async enhanceNarrative(input: EnhanceNarrativeInput): Promise<string> {
    const content = await this.complete(
      buildEnhancerSystemPrompt(input.audienceMode),
      buildEnhancerUserPrompt(input),
      { temperature: 0.55, responseFormat: 'text' },
    );

    const trimmed = content.trim();
    if (trimmed.length < 20) {
      throw new StoryIntelligenceError('NARRATIVE_ENHANCEMENT_FAILED', 'Enhanced narrative was too short');
    }
    return trimmed;
  }

  async directScenes(input: DirectScenesInput): Promise<DirectedScene[]> {
    const content = await this.complete(
      buildSceneDirectorSystemPrompt(input.audienceMode),
      buildSceneDirectorUserPrompt(input),
      { temperature: 0.6, responseFormat: 'json_object' },
    );

    let rawArray: unknown;
    try {
      const parsed = parseJsonObject(content);
      rawArray = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)?.scenes ?? parsed;
    } catch (error) {
      throw new StoryIntelligenceError('SCENE_DIRECTION_INVALID', 'Scene director response was not valid JSON', error);
    }

    if (!Array.isArray(rawArray)) {
      throw new StoryIntelligenceError('SCENE_DIRECTION_INVALID', 'Scene director response was not an array');
    }

    const scenes: DirectedScene[] = [];
    for (const [index, item] of (rawArray as unknown[]).entries()) {
      const withVersion = typeof item === 'object' && item !== null
        ? { ...item as Record<string, unknown>, version: 'scene_director_v1', ordinal: (item as Record<string, unknown>).ordinal ?? index + 1 }
        : item;
      const result = directedSceneSchema.safeParse(withVersion);
      if (result.success) {
        scenes.push(result.data);
      } else {
        console.warn('[storyIntelligence] scene %d failed validation — skipping: %s', index + 1, result.error.issues[0]?.message);
      }
    }

    if (scenes.length === 0) {
      throw new StoryIntelligenceError('SCENE_DIRECTION_INVALID', 'Scene director produced no valid scenes');
    }

    return scenes.slice(0, input.sceneCount).sort((a, b) => a.ordinal - b.ordinal);
  }
}
