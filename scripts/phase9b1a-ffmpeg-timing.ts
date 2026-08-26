import { executeMovieRenderJob } from '../packages/api/src/lib/movieRenderWorker';
import type { MovieRenderPlan } from '../packages/api/src/lib/movieRenderPlanning';
import {
  MOVIE_RENDER_DEFAULTS,
  MOVIE_RENDERER_VERSION,
  calculateExpectedRenderDuration,
  calculateRenderedSegmentDuration,
  hashRenderPlan,
} from '../packages/api/src/lib/movieRenderPlanning';

const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

type ShotInput = {
  durationSeconds: number;
  transition: string;
  transitionDurationSeconds: number;
  cameraMovement?: string;
};

function prismaMock(job: any) {
  const events: any[] = [];
  const assets: any[] = [];
  const prisma: any = {
    movieRenderEvent: {
      create: async ({ data }: any) => events.push({ id: `evt_${events.length + 1}`, ...data }),
    },
    movieRenderJob: {
      findUnique: async () => job,
      update: async ({ data }: any) => {
        Object.assign(job, data);
        if (data.attemptCount?.increment) job.attemptCount += data.attemptCount.increment;
        return job;
      },
    },
    movieAsset: {
      count: async () => assets.length,
      updateMany: async () => ({ count: assets.length }),
      create: async ({ data }: any) => {
        const asset = { id: `movie_${assets.length + 1}`, ...data };
        assets.push(asset);
        return asset;
      },
    },
    $transaction: async (operation: any) => (typeof operation === 'function' ? operation(prisma) : Promise.all(operation)),
    __events: events,
    __assets: assets,
  };
  return prisma;
}

function makePlan(name: string, shots: ShotInput[]): MovieRenderPlan {
  const planShots = shots.map((shot, index) => ({
    order: index + 1,
    sequenceSceneId: `${name}_entry_${index + 1}`,
    storySceneId: `${name}_scene_${index + 1}`,
    assetId: `${name}_asset_${index + 1}`,
    sourceUrl: pngDataUrl,
    durationSeconds: shot.durationSeconds,
    renderDurationSeconds: calculateRenderedSegmentDuration(shot),
    transition: index === 0 ? 'NONE' : shot.transition,
    transitionDurationSeconds: index === 0 ? 0 : shot.transitionDurationSeconds,
    holdDurationSeconds: 0,
    shotType: 'MEDIUM',
    cameraMovement: shot.cameraMovement ?? 'STATIC',
    cameraSpeed: 'NORMAL',
    cameraSpeedMultiplier: 1,
    zoom: 1,
  }));

  return {
    rendererVersion: MOVIE_RENDERER_VERSION,
    output: MOVIE_RENDER_DEFAULTS,
    runtimeSeconds: calculateExpectedRenderDuration(planShots),
    transitionRule: 'overlap_transitions_do_not_add_runtime',
    shots: planShots,
    warnings: [],
  };
}

async function runCase(name: string, shots: ShotInput[]) {
  const plan = makePlan(name, shots);
  const job = {
    id: `phase9b1a_${name}`,
    projectId: `project_${name}`,
    sequenceId: `sequence_${name}`,
    userId: `user_${name}`,
    status: 'QUEUED',
    renderPlan: plan,
    renderPlanHash: hashRenderPlan(plan),
    creditsCharged: 0,
    attemptCount: 0,
  };
  const prisma = prismaMock(job);
  const asset = await executeMovieRenderJob(prisma, job.id, {
    uploadMovie: async (_buffer, key) => `memory://${key}`,
  });
  if (!asset) throw new Error(`${name} failed: ${job.errorCode ?? 'UNKNOWN'} ${job.errorMessage ?? ''}`.trim());
  const verification = asset.metadata.verification;
  return {
    name,
    expected: plan.runtimeSeconds,
    actual: verification.actualDurationSeconds,
    delta: verification.durationDeltaSeconds,
    tolerance: verification.toleranceSeconds,
    width: verification.width,
    height: verification.height,
    fps: verification.fps,
    codec: verification.codec,
    fileSizeBytes: verification.fileSizeBytes,
    checksum: asset.checksum,
  };
}

async function main() {
  const cases = [
    () => runCase('cuts_only_12s', [
      { durationSeconds: 3, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 4, transition: 'CUT', transitionDurationSeconds: 0 },
      { durationSeconds: 5, transition: 'CUT', transitionDurationSeconds: 0 },
    ]),
    () => runCase('one_dissolve_10s', [
      { durationSeconds: 5, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 5, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 1 },
    ]),
    () => runCase('multiple_dissolves_12s', [
      { durationSeconds: 3, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 4, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.5 },
      { durationSeconds: 5, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.5 },
    ]),
    () => runCase('mixed_transitions_16s', [
      { durationSeconds: 3, transition: 'NONE', transitionDurationSeconds: 0 },
      { durationSeconds: 4, transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.5, cameraMovement: 'PAN_RIGHT' },
      { durationSeconds: 4, transition: 'DIP_TO_BLACK', transitionDurationSeconds: 0.5, cameraMovement: 'PUSH_IN' },
      { durationSeconds: 5, transition: 'FADE', transitionDurationSeconds: 0.5, cameraMovement: 'PULL_OUT' },
    ]),
  ];
  const results = [];
  for (const testCase of cases) results.push(await testCase());
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
