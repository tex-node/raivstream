/**
 * Phase 16.2 — Production Script Structurer (GPT-4o).
 *
 * Stage 2 of the AI Narrative & Production Pipeline: converts the Stage-1 story
 * prose into a strict `ProductionManifest` JSON configured for MiniMax H3 video
 * generation (camera control, lighting, native audio/SFX cues) and ElevenLabs
 * narration scripts.
 *
 * Fail-closed: inert unless `STORY_MANIFEST_STRUCTURER_ENABLED` is true AND a key
 * is present (`GPT40_API`, alias `OPENAI_API_KEY`). Uses OpenAI `chat.completions`
 * with `response_format: { type: 'json_object' }` and validates/normalises the
 * result against the manifest schema.
 *
 * Server-only module. Keys must never be exposed client-side.
 */

import { z } from 'zod';

export const MANIFEST_STRUCTURER_FLAG = 'STORY_MANIFEST_STRUCTURER_ENABLED';
export const GPT40_DEFAULT_MODEL = 'gpt-4o';
const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export type StoryAudienceMode = 'KIDS' | 'GENERAL';

export interface ProductionScene {
  scene_id: number;
  elevenlabs_narration: string;
  minimax_video_prompt: string;
  camera_motion: string;
  duration_sec: number; // 5–15
  resolution: '768P' | '1080P';
  first_frame_image_url: string | null;
}

export interface ProductionManifest {
  title: string;
  logline: string;
  scenes: ProductionScene[];
}

export const productionSceneSchema = z.object({
  scene_id: z.number().int().min(1),
  elevenlabs_narration: z.string().min(1),
  minimax_video_prompt: z.string().min(1),
  camera_motion: z.string().min(1),
  duration_sec: z.number().min(5).max(15),
  resolution: z.enum(['768P', '1080P']),
  first_frame_image_url: z.string().nullable(),
});

export const productionManifestSchema = z.object({
  title: z.string().min(1).max(160),
  logline: z.string().min(1).max(600),
  scenes: z.array(productionSceneSchema).min(1).max(12),
});

export interface ManifestStructurerInput {
  title?: string;
  logline?: string;
  prose: string;
  audienceMode?: StoryAudienceMode;
  supporting?: Record<string, unknown>;
}

export interface ManifestStructurerDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

/** True only when the operator has enabled the structurer AND a key is configured. */
export function isManifestStructurerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[MANIFEST_STRUCTURER_FLAG] !== 'true') return false;
  return Boolean(manifestApiKey(env));
}

/** OpenAI key for the structurer — `GPT40_API` with `OPENAI_API_KEY` alias. */
export function manifestApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GPT40_API ?? env.OPENAI_API_KEY;
}

/** GPT-4o model for the structurer (overridable). */
export function gpt40Model(env: NodeJS.ProcessEnv = process.env): string {
  return env.GPT40_MODEL ?? GPT40_DEFAULT_MODEL;
}

const SAFETY_HINT: Record<StoryAudienceMode, string> = {
  KIDS: 'Audience: KIDS. Keep every prompt child-safe, warm, and non-violent; no fear-inducing imagery or adult themes.',
  GENERAL: 'Audience: GENERAL. No sexual content, graphic violence, hateful themes, or gore.',
};

export const STAGE_2_SYSTEM_PROMPT = `You are a Director of Photography and AI Cinematographer specializing in MiniMax H3 video generation. Your job is to take story prose and convert it into a structured production JSON object.

YOU MUST OUTPUT STRICTLY VALID JSON FOLLOWING THIS EXACT SCHEMA:
{
  "title": "String",
  "logline": "String",
  "scenes": [
    {
      "scene_id": "Number",
      "elevenlabs_narration": "String (Voiceover script for ElevenLabs. Include emotion/pacing hints)",
      "minimax_video_prompt": "String (Cinematic prompt for MiniMax H3 video generation)",
      "camera_motion": "String (e.g., Slow push-in, Orbit, Low-angle tracking shot, Pan)",
      "duration_sec": "Number (Accepted values: 5 to 15)",
      "resolution": "String (Accepted values: '768P' or '1080P')",
      "first_frame_image_url": "String or Null (Optional image URL for I2V framing)"
    }
  ]
}

RULES FOR 'minimax_video_prompt':
- MUST follow the formula: [Shot Type & Camera Motion] + [Subject & Physical Action] + [Lighting & Atmosphere] + [Lens & Style] + [Native Audio/SFX Cues]
- MiniMax H3 generates native audio/SFX alongside video. Explicitly include sound effects in the prompt (e.g., "sound of howling wind and rustling coat").
- Example: "Cinematic low-angle medium shot, slow steady push-in towards eyes, detective presses back against concrete wall in rain, crimson flashing lights, atmospheric fog, 35mm lens, 24fps. Ambient sound of heavy rainfall, distant sirens, and wet footsteps."
- NEVER use generic buzzwords like "4K", "HD", or "hyperrealistic". Use technical cinematography terminology.
- Keep each prompt suitable for the stated audience and consistent with the source prose (characters, setting, mood).`;

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normaliseResolution(value: unknown): '768P' | '1080P' {
  const raw = asString(value).toUpperCase().replace(/\s+/g, '');
  if (raw === '768P' || raw === '1080P') return raw as '768P' | '1080P';
  return '1080P';
}

function normaliseScene(raw: unknown, index: number): ProductionScene {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const duration = asNumber(record.duration_sec ?? record.duration);
  const sceneId = asNumber(record.scene_id ?? record.id);
  return {
    scene_id: Number.isFinite(sceneId) ? Math.max(1, Math.floor(sceneId as number)) : index + 1,
    elevenlabs_narration: asString(record.elevenlabs_narration ?? record.narration),
    minimax_video_prompt: asString(record.minimax_video_prompt ?? record.prompt ?? record.video_prompt),
    camera_motion: asString(record.camera_motion ?? record.camera ?? 'Static shot'),
    duration_sec: Math.min(15, Math.max(5, duration ?? 6)),
    resolution: normaliseResolution(record.resolution),
    first_frame_image_url: asString(record.first_frame_image_url ?? record.first_frame) || null,
  };
}

export function normaliseProductionManifest(raw: unknown, fallbackTitle: string): ProductionManifest {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(record.scenes) ? record.scenes : [];
  if (scenesRaw.length === 0) throw new Error('Production manifest has no scenes');

  const manifest: ProductionManifest = {
    title: asString(record.title, fallbackTitle).slice(0, 160) || fallbackTitle,
    logline: asString(record.logline ?? record.summary, '').slice(0, 600),
    scenes: scenesRaw.slice(0, 12).map((scene, index) => normaliseScene(scene, index)),
  };
  return productionManifestSchema.parse(manifest);
}

export function buildManifestUserMessage(input: ManifestStructurerInput): string {
  const lines = [
    ...(input.title ? [`Title: ${input.title}`] : []),
    ...(input.logline ? [`Logline: ${input.logline}`] : []),
    input.audienceMode ? SAFETY_HINT[input.audienceMode] : '',
    `Story prose:\n${input.prose}`,
  ].filter(Boolean);
  return lines.join('\n\n');
}

/**
 * Run Stage 2. Throws when disabled/not configured or when the provider returns
 * an unparseable/invalid manifest. Callers decide the fallback policy.
 */
export async function structureProductionManifest(
  input: ManifestStructurerInput,
  deps: ManifestStructurerDeps = {},
): Promise<ProductionManifest> {
  const env = deps.env ?? process.env;
  if (!isManifestStructurerEnabled(env)) {
    throw new Error('Production manifest structurer is not enabled');
  }
  const apiKey = manifestApiKey(env);
  if (!apiKey) throw new Error('Production manifest structurer is not configured');

  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const response = await doFetch(CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: gpt40Model(env),
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STAGE_2_SYSTEM_PROMPT },
        { role: 'user', content: buildManifestUserMessage(input) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Production manifest structurer failed with ${response.status}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Production manifest structurer returned no content');

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    const match = content.trim().match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Production manifest structurer returned invalid JSON');
    raw = JSON.parse(match[0]);
  }

  return normaliseProductionManifest(raw, input.title ?? 'Untitled Production');
}