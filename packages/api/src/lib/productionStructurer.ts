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

export interface ProductionSceneShot {
  shot_id: string;
  timeframe: string;
  camera_setup: string;
  action_description: string;
  video_prompt: string;
  transition_to_next: string;
}

export interface ProductionScene {
  scene_id: number;
  elevenlabs_narration: string;
  minimax_video_prompt: string;
  camera_motion: string;
  duration_sec: number; // 5–15
  resolution: '768P' | '1080P';
  first_frame_image_url: string | null;
  /** Optional 5–6s shot breakdown for scenes longer than a single clip (Phase 17 multi-clip engine). */
  shots?: ProductionSceneShot[];
}

export interface ProductionManifest {
  title: string;
  logline: string;
  /** Master Visual Bible — style-lock prefix appended verbatim to EVERY generation prompt. */
  master_style: string;
  /** Negative tags appended to EVERY generation payload to stop style morphing. */
  negative_prompt_suffix: string;
  /** Per-character physical/wardrobe anchors, re-used verbatim whenever the character appears. */
  characters: Record<string, string>;
  scenes: ProductionScene[];
}

export const productionSceneShotSchema = z.object({
  shot_id: z.string().min(1),
  timeframe: z.string().min(1),
  camera_setup: z.string().min(1),
  action_description: z.string().min(1),
  video_prompt: z.string().min(1),
  transition_to_next: z.string().min(1),
});

export const productionSceneSchema = z.object({
  scene_id: z.number().int().min(1),
  elevenlabs_narration: z.string().min(1),
  minimax_video_prompt: z.string().min(1),
  camera_motion: z.string().min(1),
  duration_sec: z.number().min(5).max(15),
  resolution: z.enum(['768P', '1080P']),
  first_frame_image_url: z.string().nullable(),
  shots: z.array(productionSceneShotSchema).min(1).max(12).optional(),
});

export const productionManifestSchema = z.object({
  title: z.string().min(1).max(160),
  logline: z.string().min(1).max(600),
  master_style: z.string().min(1),
  negative_prompt_suffix: z.string().min(1),
  characters: z.record(z.string().min(1)).default({}),
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

export const STAGE_2_SYSTEM_PROMPT = `You are an expert Hollywood Cinematographer, Director, and Executive Producer AI for AI video models (Runway Gen-3, Luma, Sora, Kling, MiniMax H3). Your job is to convert story prose into a character-locked, shot-by-shot video production JSON. Your PRIMARY objectives are: (1) strict character continuity, (2) eliminate style drift (no shifts between photorealism and 2D/animation), (3) enforce 5-6 second shot timing, (4) precise cinematic camera language.

YOU MUST OUTPUT STRICTLY VALID JSON FOLLOWING THIS EXACT SCHEMA:
{
  "title": "String",
  "logline": "String",
  "master_style": "String — the MASTER STYLE ANCHOR: a strict cinematic style prefix that will be prepended verbatim to EVERY generation prompt (e.g., Cinematic live-action photorealism, 35mm anamorphic lens, volumetric lighting, Kodachrome color grade, subtle film grain). Never change style between scenes.",
  "negative_prompt_suffix": "String — comma-separated negative tags appended to EVERY generation payload to stop style morphing (e.g., '2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing')",
  "characters": {
    "MARCUS": "Full physical & wardrobe anchor description (age, ethnicity, hair, facial hair, eyes, exact clothing). Re-used verbatim whenever the character appears."
  },
  "scenes": [
    {
      "scene_id": "Number",
      "elevenlabs_narration": "String (Voiceover script for ElevenLabs. Include emotion/pacing hints)",
      "minimax_video_prompt": "String",
      "camera_motion": "String",
      "duration_sec": "Number (Accepted values: 5 to 15)",
      "resolution": "String (Accepted values: '768P' or '1080P')",
      "first_frame_image_url": "String or Null (ALWAYS null — the server fills I2V first frames)",
      "shots": [ "OPTIONAL. Only for scenes longer than one clip: the 5-6s shot grid.",
        {
          "shot_id": "SCENE_01_SHOT_01",
          "timeframe": "00:00 - 00:05",
          "camera_setup": "e.g., Medium Close-Up, Tracking Shot, Eye Level",
          "action_description": "Detailed physical motion in the 5 seconds",
          "video_prompt": "String (same formula as minimax_video_prompt, for this shot)",
          "transition_to_next": "How the shot ends"
        }
      ]
    }
  ]
}

RULE 1 — MASTER VISUAL BIBLE: 'minimax_video_prompt' (and every shot 'video_prompt') MUST be constructed as:
  [master_style] + [camera_setup] + [character descriptions, verbatim from 'characters'] + [action] + [negative_prompt_suffix as '--no ' + suffix]
Never omit the style anchor or the negative suffix. Never describe a character with new prose — copy the 'characters' anchor verbatim.

RULE 2 — STRICT CAMERA VOCABULARY: choose 'camera_setup'/'camera_motion' ONLY from this library:
  Shot Sizes: Extreme Wide Shot, Wide Shot, Medium Shot, Close-Up, Extreme Close-Up, Over-the-Shoulder
  Camera Motions: Static Hold, Slow Push-In, Pull-Back, Tracking Shot, Pan Left/Right, Tilt Up/Down, Whip Pan
  Angles: Eye Level, Low Angle, High Angle, Bird's-Eye View, Dutch Angle
  Lens/Lighting: 35mm Anamorphic, Shallow Depth of Field, Rack Focus, Volumetric Fog, Chiaroscuro High Contrast

RULE 3 — SHOT TIMING: a scene of 20 seconds MUST be decomposed into 4 sequential 5-6s shots (00:00-00:05, 00:05-00:10, 00:10-00:15, 00:15-00:20). Shots flow into each other via I2V continuity logic (the final frame of shot N becomes the starting context of shot N+1).

RULE 4 — GENERATION QUALITY:
- MiniMax H3 generates native audio/SFX alongside video. Explicitly include sound effects in prompts (e.g., "sound of howling wind and rustling coat").
- NEVER use generic buzzwords like "4K", "HD", or "hyperrealistic". Use technical cinematography terminology.
- Keep every prompt suitable for the stated audience and consistent with the source prose (characters, setting, mood).`;

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

function normaliseShot(raw: unknown, index: number, sceneId: number): ProductionSceneShot {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    shot_id: asString(record.shot_id ?? record.shotId, `SCENE_${String(sceneId).padStart(2, '0')}_SHOT_${String(index + 1).padStart(2, '0')}`),
    timeframe: asString(record.timeframe ?? record.timerange, ''),
    camera_setup: asString(record.camera_setup ?? record.camera ?? 'Static Hold, Eye Level'),
    action_description: asString(record.action_description ?? record.action, ''),
    video_prompt: asString(record.video_prompt ?? record.prompt, ''),
    transition_to_next: asString(record.transition_to_next ?? record.transition, ''),
  };
}

function normaliseScene(raw: unknown, index: number): ProductionScene {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const duration = asNumber(record.duration_sec ?? record.duration);
  const shotsRaw = Array.isArray(record.shots) ? record.shots : [];
  const shots = shotsRaw.length > 0
    ? shotsRaw.slice(0, 12).map((shot, shotIndex) => normaliseShot(shot, shotIndex, index + 1))
    : undefined;
  const rawSceneId = asNumber(record.scene_id ?? record.id);
  return {
    scene_id: Number.isFinite(rawSceneId) ? Math.max(1, Math.floor(rawSceneId as number)) : index + 1,
    elevenlabs_narration: asString(record.elevenlabs_narration ?? record.narration),
    minimax_video_prompt: asString(record.minimax_video_prompt ?? record.prompt ?? record.video_prompt),
    camera_motion: asString(record.camera_motion ?? record.camera ?? 'Static shot'),
    duration_sec: Math.min(15, Math.max(5, duration ?? 6)),
    resolution: normaliseResolution(record.resolution),
    first_frame_image_url: asString(record.first_frame_image_url ?? record.first_frame) || null,
    shots,
  };
}

function normaliseCharacterBible(raw: unknown): Record<string, string> {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const characters: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const name = key.trim().toUpperCase().replace(/\s+/g, '_');
    const description = asString(value);
    if (name && description) characters[name] = description;
  }
  return characters;
}

export function normaliseProductionManifest(raw: unknown, fallbackTitle: string): ProductionManifest {
  const record = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(record.scenes) ? record.scenes : [];
  if (scenesRaw.length === 0) throw new Error('Production manifest has no scenes');

  const charactersRaw = record.characters
    ?? (record.master_visual_bible as Record<string, unknown> | undefined)?.characters
    ?? (record.character_bible as Record<string, unknown> | undefined)
    ?? {};
  const manifest: ProductionManifest = {
    title: asString(record.title, fallbackTitle).slice(0, 160) || fallbackTitle,
    logline: asString(record.logline ?? record.summary, '').slice(0, 600),
    master_style: asString(
      record.master_style
      ?? (record.master_visual_bible as Record<string, unknown> | undefined)?.style_anchor_prefix
      ?? record.masterStyle
      ?? record.style_anchor,
      'Cinematic live-action photorealism, 35mm film look, realistic lighting, shallow depth of field, natural color grading',
    ),
    negative_prompt_suffix: asString(
      record.negative_prompt_suffix
      ?? (record.master_visual_bible as Record<string, unknown> | undefined)?.negative_prompt_suffix
      ?? record.negative_prompt,
      '2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing',
    ),
    characters: normaliseCharacterBible(charactersRaw),
    scenes: scenesRaw.slice(0, 12).map((scene, index) => normaliseScene(scene, index)),
  };
  return productionManifestSchema.parse(manifest);
}

export function buildManifestUserMessage(input: ManifestStructurerInput): string {
  const characterBible = input.supporting?.characterBible as string | undefined;
  const lines = [
    ...(input.title ? [`Title: ${input.title}`] : []),
    ...(input.logline ? [`Logline: ${input.logline}`] : []),
    input.audienceMode ? SAFETY_HINT[input.audienceMode] : '',
    characterBible
      ? `Character bible (use these descriptions VERBATIM in 'characters' and inside every prompt):\n${characterBible}`
      : '',
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