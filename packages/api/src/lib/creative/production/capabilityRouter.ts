/**
 * Raivstream 5.0 — CapabilityRouter (Slice 3).
 *
 * Decides INTERNALLY what to produce per scene and how: image capability
 * (FLUX2 still) + video capability (MiniMax H3 I2V), resolution/duration, and
 * prompt composition from the semantic plan + bible. The 5.0 layer and UI never
 * see providers/models/generation jobs — the router owns that translation.
 */

import { applyMasterVisualBible, type VisualBibleSource } from '../../visualBible';
import type { CreativeBibleState, CreativeProjectType } from '../shared/types';
import type { CreativeProductionPlanState, PlanScene } from './plan';
import { contextPromptLine, type ProductionContext } from './contextAdapter';

export type GenerationKind = 'IMAGE' | 'VIDEO';

export interface StillSpec {
  kind: 'IMAGE';
  sceneId: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  /**
   * Source/reference image URL from plan.sourceReferences[0].
   * When present, image generation uses FLUX Kontext (image-conditioned) instead
   * of FLUX2 (text-to-image only), preserving the subject identity from the photo.
   */
  sourceImageUrl?: string;

  /**
   * Character reference images (max 4), resolved from the SAME store the story
   * pipeline uses (`CharacterReferenceAsset`). When present, stills route to the
   * reference-conditioned endpoint; this is the difference between a text-only frame
   * and one that can hold a character across scenes.
   */
  referenceImageUrls?: string[];

  /**
   * The scene's characters with their identity text, so the runner can resolve
   * approved reference images and compose the identity block. Carried on the spec
   * because the prompt is already flattened by the time production runs.
   */
  characterRefs?: Array<{ name: string; visualDescription?: string | null; lockedIdentityBlock?: string | null }>;
}

export interface VideoSpec {
  kind: 'VIDEO';
  sceneId: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
}

export type GenerationSpec = StillSpec | VideoSpec;

function visualBibleSource(bible?: CreativeBibleState | null): VisualBibleSource {
  const visualLanguage = (bible?.visualLanguage ?? {}) as Record<string, unknown>;
  const characters = ((bible?.characters ?? []) as Array<{ name?: string; visualDescription?: string }>)
    .filter((c) => c.name && c.visualDescription);
  const map: Record<string, string> = {};
  for (const c of characters) if (c.name && c.visualDescription) map[c.name] = c.visualDescription;
  return {
    master_style: typeof visualLanguage.style === 'string' ? visualLanguage.style : undefined,
    negative_prompt_suffix: typeof visualLanguage.negativePrompt === 'string' ? visualLanguage.negativePrompt : undefined,
    characters: Object.keys(map).length ? map : undefined,
  };
}

export function buildPrompt(
  scene: PlanScene,
  kind: GenerationKind,
  bible?: CreativeBibleState | null,
  context?: ProductionContext | null,
): { prompt: string; negativePrompt?: string } {
  const bibleSource = visualBibleSource(bible);
  const visualLanguage = (bible?.visualLanguage ?? {}) as Record<string, unknown>;
  const style = typeof visualLanguage.style === 'string' ? visualLanguage.style : 'cinematic';
  const contextLine = contextPromptLine(context);
  const directionLine = scene.creativeDirection ? ` Creative direction: ${scene.creativeDirection}.` : '';
  const motionLine = (kind === 'VIDEO' && scene.motionDirection) ? ` Camera: ${scene.motionDirection}.` : '';
  const base = `${scene.description} ${scene.title}. ${kind === 'IMAGE' ? 'Key visual' : 'Motion sequence'}, ${style}, consistent character identity and visual language, vertical framing.${directionLine}${motionLine}${contextLine ? ` ${contextLine}.` : ''}`;
  const applied = applyMasterVisualBible({ prompt: base, negativePrompt: undefined, bible: bibleSource, sceneCharacters: scene.characters, target: kind === 'IMAGE' ? 'IMAGE' : 'VIDEO' });
  return { prompt: applied.prompt, negativePrompt: applied.negativePrompt ?? undefined };
}

export function clampH3Duration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 5;
  return Math.max(4, Math.min(15, Math.round(seconds)));
}

/**
 * Route a plan into ordered generation specs: one still + one video per scene.
 * Videos are chained by the runner (last-frame continuity) — the router only
 * declares intent, never the provider.
 */
export function routeProduction(
  plan: CreativeProductionPlanState,
  bible?: CreativeBibleState | null,
  context?: ProductionContext | null,
): GenerationSpec[] {
  const specs: GenerationSpec[] = [];
  const effectiveContext = context ?? plan.contextSnapshot ?? null;
  const sourceImageUrl = plan.sourceReferences?.find((ref) => Boolean(ref.url))?.url;
  for (const scene of plan.scenes) {
    const still = buildPrompt(scene, 'IMAGE', bible, effectiveContext);
    // Carry the scene's characters (with their identity text) so the runner can resolve
    // approved references and compose the identity block. The prompt alone is not enough:
    // it flattens names into prose, and a reference image needs a name to bind to.
    const bibleCharacters = (bible?.characters ?? []) as Array<{
      name?: string;
      visualDescription?: string;
      lockedIdentityBlock?: string | null;
    }>;
    const sceneNames = (scene.characters ?? []) as unknown as string[];
    const characterRefs = bibleCharacters
      .filter((c) => c.name && (sceneNames.length === 0 || sceneNames.includes(c.name)))
      .slice(0, 4)
      .map((c) => ({
        name: c.name as string,
        visualDescription: c.visualDescription ?? null,
        lockedIdentityBlock: c.lockedIdentityBlock ?? null,
      }));

    specs.push({
      kind: 'IMAGE',
      sceneId: scene.sceneId,
      prompt: still.prompt,
      negativePrompt: still.negativePrompt,
      aspectRatio: '9:16',
      ...(sourceImageUrl ? { sourceImageUrl } : {}),
      ...(characterRefs.length ? { characterRefs } : {}),
    });
    const video = buildPrompt(scene, 'VIDEO', bible, effectiveContext);
    specs.push({
      kind: 'VIDEO',
      sceneId: scene.sceneId,
      prompt: video.prompt,
      durationSeconds: clampH3Duration(scene.estimatedDurationSeconds),
      aspectRatio: '9:16',
      // 480p (not HD) — lower cost/latency for draft production.
      resolution: '480P',
    });
  }
  return specs;
}

export type { CreativeProjectType };