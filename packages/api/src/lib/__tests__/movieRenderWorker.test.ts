import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { executeMovieRenderJob } from '../movieRenderWorker';
import type { MovieRenderPlan } from '../movieRenderPlanning';

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
    $transaction: async (operation: any) => {
      if (typeof operation === 'function') return operation(prisma);
      return Promise.all(operation);
    },
    __events: events,
    __assets: assets,
  };
  return prisma;
}

const renderPlan: MovieRenderPlan = {
  rendererVersion: 'phase-9b1-v1',
  output: { width: 720, height: 1280, fps: 30, container: 'mp4', videoCodec: 'libx264', pixelFormat: 'yuv420p' },
  runtimeSeconds: 4,
  transitionRule: 'overlap_transitions_do_not_add_runtime',
  warnings: [],
  shots: [{
    order: 1,
    sequenceSceneId: 'entry_1',
    storySceneId: 'scene_1',
    assetId: 'asset_1',
    sourceUrl: 'data:text/plain;base64,c291cmNl',
    durationSeconds: 4,
    renderDurationSeconds: 4,
    transition: 'NONE',
    transitionDurationSeconds: 0,
    holdDurationSeconds: 0,
    shotType: 'MEDIUM',
    cameraMovement: 'STATIC',
    cameraSpeed: 'NORMAL',
    cameraSpeedMultiplier: 1,
    zoom: 1,
  }],
};

describe('movieRenderWorker', () => {
  it('marks a queued render ready and creates a movie asset through injected dependencies', async () => {
    const job: any = {
      id: 'job_1',
      projectId: 'project_1',
      sequenceId: 'sequence_1',
      userId: 'user_1',
      status: 'QUEUED',
      renderPlan,
      renderPlanHash: 'hash_1',
      creditsCharged: 0,
      attemptCount: 0,
    };
    const prisma = prismaMock(job);
    const commandRunner = async (command: string, args: string[]) => {
      expect(['ffmpeg', 'ffprobe']).toContain(command);
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        await writeFile(outputPath, Buffer.from('fake mp4'));
      }
      if (command === 'ffprobe') {
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '4.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '4.000000', size: '8' },
          }),
        };
      }
    };

    const asset = await executeMovieRenderJob(prisma, 'job_1', {
      commandRunner,
      uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
    });

    expect(job.status).toBe('READY');
    expect(job.progressPercent).toBe(100);
    expect(asset?.publicUrl).toContain('/story-projects/project_1/movies/job_1/movie.mp4');
    expect(asset?.metadata.verification.durationDeltaSeconds).toBe(0);
    expect(prisma.__assets).toHaveLength(1);
    expect(prisma.__events.some((event: any) => event.eventName === 'movie_render_completed')).toBe(true);
  });

  it('fails instead of marking READY when FFprobe duration mismatches the render plan', async () => {
    const job: any = {
      id: 'job_1',
      projectId: 'project_1',
      sequenceId: 'sequence_1',
      userId: 'user_1',
      status: 'QUEUED',
      renderPlan,
      renderPlanHash: 'hash_1',
      creditsCharged: 0,
      attemptCount: 0,
    };
    const prisma = prismaMock(job);
    const commandRunner = async (command: string, args: string[]) => {
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1];
        await writeFile(outputPath, Buffer.from('fake mp4'));
      }
      if (command === 'ffprobe') {
        return {
          stdout: JSON.stringify({
            streams: [{ codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '30/1', duration: '2.000000' }],
            format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '2.000000', size: '8' },
          }),
        };
      }
    };

    const asset = await executeMovieRenderJob(prisma, 'job_1', {
      commandRunner,
      uploadMovie: async (_buffer, key) => `https://cdn.test/${key}`,
    });

    expect(asset).toBeNull();
    expect(job.status).toBe('FAILED');
    expect(job.errorCode).toBe('OUTPUT_DURATION_MISMATCH');
    expect(prisma.__assets).toHaveLength(0);
    expect(prisma.__events.some((event: any) => event.eventName === 'movie_render_completed')).toBe(false);
    expect(prisma.__events.some((event: any) => event.eventName === 'movie_render_failed')).toBe(true);
  });
});
