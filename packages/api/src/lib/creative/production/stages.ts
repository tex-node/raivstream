/**
 * Raivstream 5.0 — Production stage model (Phase 9).
 *
 * The creator should understand "Raivstream is still working on my film", never
 * "some backend job is at 62%". Stages are derived from what is actually done —
 * never a fake percentage. Pure and unit-testable.
 */

export const PRODUCTION_STAGE_ORDER = [
  'understanding',
  'building',
  'planning',
  'creating_scenes',
  'checking_continuity',
  'finalizing',
] as const;
export type ProductionStage = (typeof PRODUCTION_STAGE_ORDER)[number] | 'ready';

export interface ProductionStageEntry {
  id: ProductionStage;
  label: string;
  state: 'done' | 'active' | 'pending';
}

export interface ProductionStageInput {
  projectStatus: string;
  hasPlan: boolean;
  hasBible: boolean;
  hasCharacters: boolean;
  ready: number;
  failed: number;
  generating: number;
  expected: number;
  currentSceneIndex: number;
}

const REVIEW_OR_LATER = new Set(['REVIEW', 'REFINING', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);
const DONE_LATER = new Set(['PUBLISHED', 'ARCHIVED']);

export function deriveProductionStages(input: ProductionStageInput): { stage: ProductionStage; stages: ProductionStageEntry[] } {
  const allReady = input.expected > 0 && input.ready >= input.expected;
  const reviewOrLater = REVIEW_OR_LATER.has(input.projectStatus);
  const producing = input.projectStatus === 'GENERATING' || input.projectStatus === 'DIRECTING';
  const sceneNumber = Math.max(1, input.currentSceneIndex + 1);

  const stages: ProductionStageEntry[] = [
    {
      id: 'understanding',
      label: 'Understanding your story',
      state: input.hasPlan || input.hasBible ? 'done' : input.projectStatus === 'IDEA' || input.projectStatus === 'INTERPRETING' ? 'active' : 'pending',
    },
    {
      id: 'building',
      label: 'Building characters',
      state: input.hasCharacters ? 'done' : input.hasBible ? 'active' : 'pending',
    },
    {
      id: 'planning',
      label: 'Planning scenes',
      state: input.hasPlan ? 'done' : input.hasBible ? 'active' : 'pending',
    },
    {
      id: 'creating_scenes',
      label: allReady || reviewOrLater ? 'Creating scenes' : `Creating Scene ${sceneNumber}`,
      state: allReady || reviewOrLater ? 'done' : producing ? 'active' : 'pending',
    },
    {
      id: 'checking_continuity',
      label: 'Checking continuity',
      state: reviewOrLater ? 'done' : allReady && producing ? 'active' : 'pending',
    },
    {
      id: 'finalizing',
      label: 'Preparing your final cut',
      state: DONE_LATER.has(input.projectStatus) ? 'done' : reviewOrLater ? 'active' : 'pending',
    },
  ];

  const active = stages.find((entry) => entry.state === 'active');
  const stage: ProductionStage = active ? active.id : stages.every((entry) => entry.state === 'done') ? 'ready' : (stages.find((entry) => entry.state === 'pending')?.id ?? 'ready');

  return { stage, stages };
}
