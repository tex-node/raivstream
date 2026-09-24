/**
 * Raivstream 5.0 — Creative Treatment Provider.
 *
 * Derives per-scene image composition and camera/motion direction from the actual
 * user intent and (optionally) the uploaded source image. Follows the same
 * OpenAI-compatible pattern as creativeCriticProvider — same credentials, same
 * JSON output contract, same graceful-degradation idiom.
 *
 * Gated by CREATIVE_TREATMENT_ENABLED (default on when OPENAI_API_KEY is set).
 * Falls back to the static creativeDirectionFor() templates on any failure.
 */

export interface SceneTreatment {
  sceneId: string;
  creativeDirection: string;
  motionDirection: string;
}

export interface TreatmentInput {
  originalIntent: string;
  refinedIntent?: string;
  objective?: string;
  tone?: string;
  audience?: string;
  visualStyle?: string;
  sourceImageUrl?: string;
  scenes: Array<{ sceneId: string; title: string; beat: string; description: string }>;
}

export interface TreatmentResult {
  scenes: SceneTreatment[];
  provider: string;
  model: string;
}

export class CreativeTreatmentUnavailableError extends Error {
  constructor(message = 'Creative treatment provider is not configured') {
    super(message);
    this.name = 'CreativeTreatmentUnavailableError';
  }
}

function configuredModel(): string {
  return process.env.CREATIVE_TREATMENT_MODEL ?? process.env.OPENAI_TEXT_MODEL ?? 'gpt-4o-mini';
}

function buildSystemPrompt(): string {
  return [
    'You are a Creative Director at a premium visual content studio specialising in product commercials.',
    'You translate a client brief into specific, actionable visual and camera treatments for each scene.',
    'You understand composition, cinematography, lighting, product presentation, and motion design.',
    'Each scene must have a VISUALLY DISTINCT treatment — different setting, different lighting, different camera move.',
    'Do not use the same camera movement for more than one scene.',
    'If a product image is provided, describe its visual characteristics in the treatments (colour, texture, silhouette, material).',
    'Return JSON only. No markdown. No explanations.',
  ].join(' ');
}

function buildUserPrompt(input: TreatmentInput): string {
  const intentLine = input.originalIntent || input.refinedIntent || 'a commercial';
  const contextParts: string[] = [
    `Intent: "${intentLine}"`,
    input.objective ? `Objective: ${input.objective}` : null,
    input.tone ? `Tone: ${input.tone}` : null,
    input.audience ? `Audience: ${input.audience}` : null,
    input.visualStyle ? `Visual style: ${input.visualStyle}` : null,
  ].filter((p): p is string => Boolean(p));

  const sceneLines = input.scenes.map(
    (scene, i) =>
      `Scene ${i + 1} (${scene.sceneId}): "${scene.title}" — Beat: "${scene.beat}" — Role: ${scene.description}`,
  );

  const imageNote = input.sourceImageUrl
    ? 'A product image is attached. Base your treatments on the actual visual characteristics of this product.'
    : 'No product image provided — infer visual characteristics from the intent.';

  return [
    `Provide creative treatments for this ${input.scenes.length}-scene commercial.`,
    '',
    contextParts.join('\n'),
    '',
    imageNote,
    '',
    'Scenes:',
    ...sceneLines,
    '',
    'For EACH scene return:',
    '  creativeDirection: What the image should look like — setting, lighting, framing, composition, product placement. Be specific to the product and its visual characteristics.',
    '  motionDirection: A single explicit camera instruction for the video (e.g. "Slow push-in toward the bottle", "Controlled 90° lateral orbit around the product", "Static hold with a gentle brightness lift"). Must differ across scenes.',
    '',
    'The four treatments must be clearly different from each other.',
    '',
    `Return JSON exactly: { "scenes": [ { "sceneId": "SCENE_01", "creativeDirection": "...", "motionDirection": "..." }, ... ] }`,
  ].join('\n');
}

function parseSceneTreatments(raw: unknown, expectedIds: string[]): SceneTreatment[] {
  if (!raw || typeof raw !== 'object') throw new Error('Treatment response is not an object');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.scenes)) throw new Error('Treatment response missing scenes array');
  const treatments = obj.scenes.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error(`Scene ${index} is not an object`);
    const scene = item as Record<string, unknown>;
    const sceneId = typeof scene.sceneId === 'string' ? scene.sceneId : expectedIds[index] ?? `SCENE_${String(index + 1).padStart(2, '0')}`;
    const creativeDirection = typeof scene.creativeDirection === 'string' && scene.creativeDirection ? scene.creativeDirection.slice(0, 300) : null;
    const motionDirection = typeof scene.motionDirection === 'string' && scene.motionDirection ? scene.motionDirection.slice(0, 200) : null;
    if (!creativeDirection || !motionDirection) throw new Error(`Scene ${sceneId} missing creativeDirection or motionDirection`);
    return { sceneId, creativeDirection, motionDirection };
  });
  return treatments;
}

export type TreatmentEvaluator = (input: TreatmentInput) => Promise<TreatmentResult>;

class OpenAICompatibleCreativeTreatmentProvider {
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = configuredModel();

  get isConfigured(): boolean {
    if (process.env.CREATIVE_TREATMENT_ENABLED === 'false') return false;
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generate(input: TreatmentInput): Promise<TreatmentResult> {
    if (!this.isConfigured) throw new CreativeTreatmentUnavailableError();

    const userContent: Array<Record<string, unknown>> = [
      { type: 'text', text: buildUserPrompt(input) },
    ];
    if (input.sourceImageUrl) {
      userContent.push({ type: 'image_url', image_url: { url: input.sourceImageUrl } });
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Creative treatment provider failed with ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Creative treatment provider returned no content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Creative treatment provider returned invalid JSON');
    }

    const expectedIds = input.scenes.map((s) => s.sceneId);
    return {
      scenes: parseSceneTreatments(parsed, expectedIds),
      provider: 'openai-compatible',
      model: this.model,
    };
  }
}

export const creativeTreatmentProvider = new OpenAICompatibleCreativeTreatmentProvider();
