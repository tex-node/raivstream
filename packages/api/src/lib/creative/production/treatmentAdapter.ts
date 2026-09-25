/**
 * Raivstream 5.0 — Creative Treatment Adapter.
 *
 * Enriches a deterministic production plan with AI-derived per-scene creative
 * direction and camera/motion instruction. Fail-soft: any provider failure or
 * configuration absence returns the original plan unchanged so plan creation
 * is never blocked.
 *
 * Priority invariant: this adapter runs at plan-creation time. Director
 * instructions run after the plan is created and overwrite scene.creativeDirection
 * directly, so Director changes naturally take precedence over AI enrichment.
 */

import type { CreativeProductionPlanState } from './plan';
import type { CreativeBriefState, CreativeBibleState } from '../shared/types';
import {
  creativeTreatmentProvider,
  CreativeTreatmentUnavailableError,
  type TreatmentEvaluator,
  type TreatmentInput,
} from './treatmentProvider';

const defaultEvaluator: TreatmentEvaluator = (input) => creativeTreatmentProvider.generate(input);

function buildTreatmentInput(
  plan: CreativeProductionPlanState,
  brief?: CreativeBriefState | null,
  bible?: CreativeBibleState | null,
  sourceImageUrl?: string,
): TreatmentInput {
  const visualLanguage = (bible?.visualLanguage ?? {}) as Record<string, unknown>;
  const style = typeof visualLanguage.style === 'string' ? visualLanguage.style : undefined;
  return {
    originalIntent: brief?.originalIntent ?? '',
    refinedIntent: brief?.refinedIntent ?? undefined,
    objective: brief?.objective ?? undefined,
    tone: brief?.tone ?? undefined,
    audience: brief?.audience ?? undefined,
    visualStyle: style,
    sourceImageUrl,
    scenes: plan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      title: scene.title,
      beat: scene.beat,
      description: scene.description,
    })),
  };
}

/**
 * Enrich a production plan with AI-derived per-scene creative and motion
 * direction. Returns the original plan on any failure — production is never
 * blocked and the static creativeDirectionFor() template strings survive.
 *
 * `lockedSceneIds` — sceneIds whose creativeDirection was explicitly set by
 * the Director. Treatment enrichment NEVER overwrites these, so Director
 * decisions survive re-planning (priority invariant: Director > Treatment).
 */
export async function enrichCreativePlan(
  plan: CreativeProductionPlanState,
  brief?: CreativeBriefState | null,
  bible?: CreativeBibleState | null,
  sourceImageUrl?: string,
  evaluator: TreatmentEvaluator = defaultEvaluator,
  lockedSceneIds?: ReadonlySet<string>,
): Promise<CreativeProductionPlanState> {
  try {
    const input = buildTreatmentInput(plan, brief, bible, sourceImageUrl);
    const result = await evaluator(input);

    const treatmentMap = new Map(result.scenes.map((t) => [t.sceneId, t]));
    const enrichedScenes = plan.scenes.map((scene) => {
      // Director-applied directions must not be overwritten by AI treatment.
      if (lockedSceneIds?.has(scene.sceneId)) return scene;
      const treatment = treatmentMap.get(scene.sceneId);
      if (!treatment) return scene;
      return { ...scene, creativeDirection: treatment.creativeDirection, motionDirection: treatment.motionDirection };
    });

    return { ...plan, scenes: enrichedScenes };
  } catch (error) {
    if (error instanceof CreativeTreatmentUnavailableError) {
      console.info('[creative.treatment] provider unavailable — keeping static creative direction');
    } else {
      console.warn('[creative.treatment] enrichment failed — keeping static creative direction:', (error as Error).message);
    }
    return plan;
  }
}
