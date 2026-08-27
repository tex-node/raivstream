/**
 * Admin router — all procedures require ADMIN role.
 * Moderator-safe procedures use moderatorProcedure.
 */

import { z } from 'zod';
import { router, adminProcedure, moderatorProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { ffmpegAvailable } from '../lib/movieRenderWorker';

export const adminRouter = router({
  // ─── Overview Stats ────────────────────────────────────────────────────────

  /**
   * Dashboard overview cards:
   * total users, new today, total credit balance, total view hours,
   * total videos, total generation jobs, total revenue (credit purchases)
   */
  getOverview: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      usersByRole,
      usersByTier,
      totalVideos,
      totalCreditsInCirculation,
      totalViewHours,
      totalGenerationJobs,
      jobsByStatus,
      jobsByModel,
      recentRevenue,
    ] = await Promise.all([
      // Total users
      ctx.prisma.user.count(),

      // New sign-ups today
      ctx.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),

      // Users by role
      ctx.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),

      // Users by premium tier
      ctx.prisma.user.groupBy({ by: ['premiumTier'], _count: { id: true } }),

      // Total published videos
      ctx.prisma.video.count({ where: { status: 'READY' } }),

      // Sum of all credit balances
      ctx.prisma.creditBalance.aggregate({ _sum: { balance: true } }),

      // Total watch seconds → hours (sum of watchTime across all interactions)
      ctx.prisma.videoInteraction.aggregate({ _sum: { watchTime: true } }),

      // Total generation jobs
      ctx.prisma.generationJob.count(),

      // Generation jobs by status
      ctx.prisma.generationJob.groupBy({ by: ['status'], _count: { id: true } }),

      // Generation jobs by model
      ctx.prisma.generationJob.groupBy({ by: ['model'], _count: { id: true }, _sum: { creditsUsed: true } }),

      // Total credits purchased (last 30 days)
      ctx.prisma.creditTransaction.aggregate({
        where: {
          type: 'PURCHASE',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const totalWatchSeconds = totalViewHours._sum.watchTime ?? 0;

    return {
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
        byTier: Object.fromEntries(usersByTier.map((r) => [r.premiumTier, r._count.id])),
      },
      content: {
        totalVideos,
        totalWatchHours: Math.round(totalWatchSeconds / 3600),
      },
      credits: {
        inCirculation: totalCreditsInCirculation._sum.balance ?? 0,
        totalGenerationJobs,
        jobsByStatus: Object.fromEntries(jobsByStatus.map((r) => [r.status, r._count.id])),
        jobsByModel: jobsByModel.map((r) => ({
          model: r.model,
          count: r._count.id,
          creditsUsed: r._sum.creditsUsed ?? 0,
        })),
      },
      revenue: {
        last30DaysCreditsPurchased: recentRevenue._sum.amount ?? 0,
        last30DaysTransactions: recentRevenue._count.id,
      },
    };
  }),

  sequenceAnalytics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const [sequences, sequenceScenes, versionCount, transitionUsage, cameraUsage, projectsWithSequences] = await Promise.all([
        (ctx.prisma as any).storySequence.findMany({
          where: { createdAt: { gte: since } },
          select: { id: true, projectId: true, runtimeSeconds: true, status: true, currentVersionNumber: true, createdAt: true },
        }),
        (ctx.prisma as any).storySequenceScene.findMany({
          where: { sequence: { createdAt: { gte: since } } },
          select: { durationSeconds: true, enabled: true },
        }),
        (ctx.prisma as any).sequenceVersion.count({ where: { createdAt: { gte: since } } }),
        (ctx.prisma as any).storySequenceScene.groupBy({
          by: ['transition'],
          where: { sequence: { createdAt: { gte: since } } },
          _count: { id: true },
        }),
        (ctx.prisma as any).storySequenceScene.groupBy({
          by: ['cameraMovement'],
          where: { sequence: { createdAt: { gte: since } } },
          _count: { id: true },
        }),
        (ctx.prisma as any).storySequence.groupBy({
          by: ['projectId'],
          where: { createdAt: { gte: since } },
          _count: { id: true },
        }),
      ]);

      const enabledScenes = sequenceScenes.filter((scene: any) => scene.enabled);
      const totalRuntime = sequences.reduce((sum: number, sequence: any) => sum + (sequence.runtimeSeconds ?? 0), 0);
      const completedSequences = sequences.filter((sequence: any) => sequence.currentVersionNumber > 0 || sequence.status === 'LOCKED').length;
      const runtimeHistogram = [
        { label: '0-30s', count: sequences.filter((sequence: any) => sequence.runtimeSeconds <= 30).length },
        { label: '31-60s', count: sequences.filter((sequence: any) => sequence.runtimeSeconds > 30 && sequence.runtimeSeconds <= 60).length },
        { label: '61-120s', count: sequences.filter((sequence: any) => sequence.runtimeSeconds > 60 && sequence.runtimeSeconds <= 120).length },
        { label: '120s+', count: sequences.filter((sequence: any) => sequence.runtimeSeconds > 120).length },
      ];

      return {
        rangeDays: input.days,
        sequenceCount: sequences.length,
        projectsWithSequences: projectsWithSequences.length,
        averageRuntime: sequences.length ? totalRuntime / sequences.length : 0,
        averageActiveShotCount: sequences.length ? enabledScenes.length / sequences.length : 0,
        averageShotDuration: enabledScenes.length ? enabledScenes.reduce((sum: number, scene: any) => sum + scene.durationSeconds, 0) / enabledScenes.length : 0,
        activeShotCount: enabledScenes.length,
        totalTimelineEntries: sequenceScenes.length,
        versionCount,
        sequenceCompletionRate: sequences.length ? completedSequences / sequences.length : 0,
        runtimeHistogram,
        transitionUsage: transitionUsage.map((item: any) => ({ transition: item.transition ?? 'NONE', count: item._count.id })),
        cameraUsage: cameraUsage.map((item: any) => ({ cameraMovement: item.cameraMovement ?? 'NONE', count: item._count.id })),
      };
    }),

  movieRenderDiagnostics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(5).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const [jobs, jobsByStatus, assets, recentEvents, ffmpegReady, movieCreditRate] = await Promise.all([
        (ctx.prisma as any).movieRenderJob.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          include: {
            project: { select: { id: true, title: true, audienceMode: true } },
            movieAsset: true,
          },
        }),
        (ctx.prisma as any).movieRenderJob.groupBy({
          by: ['status'],
          where: { createdAt: { gte: since } },
          _count: { id: true },
        }),
        (ctx.prisma as any).movieAsset.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
        }),
        (ctx.prisma as any).movieRenderEvent.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 80,
        }),
        ffmpegAvailable(),
        ctx.prisma.featureCreditRate.findUnique({
          where: { featureKey: 'story:movie_render' },
          select: { creditsPerUnit: true, isActive: true },
        }),
      ]);

      const completed = jobs.filter((job: any) => job.status === 'READY' && job.startedAt && job.completedAt);
      const failed = jobs.filter((job: any) => job.status === 'FAILED');
      const averageRenderMs = completed.length
        ? completed.reduce((sum: number, job: any) => sum + (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()), 0) / completed.length
        : null;
      const totalBytes = assets.reduce((sum: number, asset: any) => sum + (asset.fileSizeBytes ?? 0), 0);

      const movieRenderRateConfigured = Boolean(movieCreditRate && movieCreditRate.isActive && movieCreditRate.creditsPerUnit > 0);

      return {
        rangeDays: input.days,
        ffmpegReady,
        movieRenderRateConfigured,
        movieRenderCreditCost: movieCreditRate?.creditsPerUnit ?? null,
        movieRenderConfigurationHealthy: ffmpegReady && movieRenderRateConfigured,
        totals: {
          jobs: jobs.length,
          ready: jobs.filter((job: any) => job.status === 'READY').length,
          failed: failed.length,
          active: jobs.filter((job: any) => ['QUEUED', 'PREPARING', 'RENDERING_SHOTS', 'ASSEMBLING', 'ENCODING', 'VERIFYING', 'UPLOADING'].includes(job.status)).length,
          assets: assets.length,
          totalBytes,
          averageRenderMs,
          failureRate: jobs.length ? failed.length / jobs.length : 0,
        },
        jobsByStatus: Object.fromEntries(jobsByStatus.map((item: any) => [item.status, item._count.id])),
        recentJobs: jobs.map((job: any) => ({
          id: job.id,
          projectId: job.projectId,
          projectTitle: job.project?.title ?? 'Story',
          sequenceId: job.sequenceId,
          status: job.status,
          progressPercent: job.progressPercent,
          currentStage: job.currentStage,
          renderPlanHash: job.renderPlanHash,
          creditsCharged: job.creditsCharged,
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
          attemptCount: job.attemptCount,
          rendererVersion: job.rendererVersion,
          expectedDurationSeconds: job.movieAsset?.metadata?.verification?.expectedDurationSeconds ?? job.renderPlan?.runtimeSeconds ?? null,
          actualDurationSeconds: job.movieAsset?.metadata?.verification?.actualDurationSeconds ?? null,
          durationDeltaSeconds: job.movieAsset?.metadata?.verification?.durationDeltaSeconds ?? null,
          durationToleranceSeconds: job.movieAsset?.metadata?.verification?.toleranceSeconds ?? null,
          movieUrl: job.movieAsset?.publicUrl ?? null,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
        recentEvents,
      };
    }),

  storyAnalytics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const since = new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000);

      const funnelEvents = [
        'story_playground_opened',
        'story_generated',
        'scene_generation_completed',
        'scene_image_completed',
        'storybook_opened',
        'storybook_completed',
      ];

      const [todaysEvents, allRangeEvents, storyProjects, characterMemory, recentEvents] = await Promise.all([
        (ctx.prisma as any).analyticsEvent.findMany({
          where: { createdAt: { gte: startOfToday } },
          select: { eventName: true, projectId: true, userId: true },
        }),
        (ctx.prisma as any).analyticsEvent.findMany({
          where: { createdAt: { gte: since } },
          select: { id: true, eventName: true, projectId: true, userId: true, properties: true, createdAt: true },
        }),
        (ctx.prisma as any).storyProject.findMany({
          where: { createdAt: { gte: since } },
          select: { theme: true, ageRange: true, originalIdea: true, title: true },
        }),
        (ctx.prisma as any).storyCharacterMemory.findMany({
          where: { createdAt: { gte: since } },
          select: { name: true },
        }),
        (ctx.prisma as any).analyticsEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: { id: true, eventName: true, projectId: true, userId: true, properties: true, createdAt: true },
        }),
      ]);

      const countToday = (eventName: string) =>
        todaysEvents.filter((event: { eventName: string }) => event.eventName === eventName).length;
      const countRange = (eventName: string) =>
        allRangeEvents.filter((event: { eventName: string }) => event.eventName === eventName).length;
      const distinctActors = (eventName: string) => {
        const ids = new Set<string>();
        for (const event of allRangeEvents as Array<{ id: string; eventName: string; userId: string | null; projectId: string | null }>) {
          if (event.eventName !== eventName) continue;
          ids.add(event.userId ?? event.projectId ?? event.id);
        }
        return ids.size;
      };
      const topValues = (values: Array<string | null | undefined>, limit = 8) => {
        const counts = new Map<string, number>();
        for (const value of values) {
          const key = value?.trim();
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([label, count]) => ({ label, count }));
      };
      const inferThemeTerms = (projects: Array<{ originalIdea?: string | null; title?: string | null }>) => {
        const ignored = new Set(['the', 'and', 'with', 'about', 'going', 'story', 'school', 'for', 'that', 'this', 'from']);
        return topValues(projects.flatMap((project) =>
          `${project.originalIdea ?? project.title ?? ''}`
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter((word) => word.length > 2 && !ignored.has(word)),
        ));
      };

      return {
        rangeDays: input.days,
        cards: {
          storiesCreatedToday: countToday('story_spark_started'),
          storiesCompleted: countRange('story_generated'),
          picturesGenerated: countRange('scene_image_completed'),
          storybooksOpened: countRange('storybook_opened'),
          storybooksCompleted: countRange('storybook_completed'),
        },
        funnel: funnelEvents.map((eventName) => ({
          eventName,
          events: countRange(eventName),
          users: distinctActors(eventName),
        })),
        popular: {
          themes: topValues(storyProjects.map((project: { theme: string | null }) => project.theme)),
          inferredThemes: inferThemeTerms(storyProjects),
          ageRanges: topValues(storyProjects.map((project: { ageRange: string | null }) => project.ageRange)),
          characters: topValues(characterMemory.map((character: { name: string | null }) => character.name)),
        },
        recentEvents,
      };
    }),

  promptQuality: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(10).max(200).default(80) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const assets = await (ctx.prisma as any).storySceneAsset.findMany({
        where: { createdAt: { gte: since }, assetType: { in: ['IMAGE', 'VIDEO'] } },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          scene: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  audienceMode: true,
                  visualStyle: true,
                  status: true,
                },
              },
            },
          },
        },
      });
      const assetIds = assets.map((asset: any) => asset.id);
      const jobIds = assets.map((asset: any) => asset.generationJobId).filter(Boolean);
      const sceneIds = Array.from(new Set(assets.map((asset: any) => asset.sceneId)));
      const [jobs, feedback, criticRuns, criticFeedback, sceneAssetCounts] = await Promise.all([
        jobIds.length
          ? ctx.prisma.generationJob.findMany({ where: { id: { in: jobIds } } })
          : Promise.resolve([]),
        assetIds.length
          ? (ctx.prisma as any).promptQualityFeedback.findMany({ where: { assetId: { in: assetIds } }, orderBy: { createdAt: 'desc' } })
          : Promise.resolve([]),
        assetIds.length
          ? (ctx.prisma as any).creativeCriticRun.findMany({ where: { assetId: { in: assetIds } }, orderBy: { createdAt: 'desc' } })
          : Promise.resolve([]),
        assetIds.length
          ? (ctx.prisma as any).creativeCriticFeedback.findMany({ where: { assetId: { in: assetIds } }, orderBy: { createdAt: 'desc' } })
          : Promise.resolve([]),
        sceneIds.length
          ? (ctx.prisma as any).storySceneAsset.groupBy({ by: ['sceneId'], where: { sceneId: { in: sceneIds }, assetType: { in: ['IMAGE', 'VIDEO'] } }, _count: { id: true } })
          : Promise.resolve([]),
      ]);

      const jobById = new Map(jobs.map((job) => [job.id, job]));
      const feedbackByAsset = new Map<string, Array<{ rating: number; comment?: string | null; createdAt: Date }>>();
      for (const item of feedback as Array<{ assetId: string; rating: number; comment?: string | null; createdAt: Date }>) {
        const list = feedbackByAsset.get(item.assetId) ?? [];
        list.push(item);
        feedbackByAsset.set(item.assetId, list);
      }
      const criticRunsByAsset = new Map<string, any[]>();
      for (const run of criticRuns as any[]) {
        const list = criticRunsByAsset.get(run.assetId) ?? [];
        list.push(run);
        criticRunsByAsset.set(run.assetId, list);
      }
      const criticFeedbackByAsset = new Map<string, any[]>();
      for (const item of criticFeedback as any[]) {
        const list = criticFeedbackByAsset.get(item.assetId) ?? [];
        list.push(item);
        criticFeedbackByAsset.set(item.assetId, list);
      }
      const countByScene = new Map((sceneAssetCounts as Array<{ sceneId: string; _count: { id: number } }>).map((item) => [item.sceneId, item._count.id]));
      const rows = assets.map((asset: any) => {
        const job = asset.generationJobId ? jobById.get(asset.generationJobId) : null;
        const metadata = (job?.metadata ?? {}) as Record<string, any>;
        const assetFeedback = feedbackByAsset.get(asset.id) ?? [];
        const assetCriticRuns = criticRunsByAsset.get(asset.id) ?? [];
        const latestCriticRun = assetCriticRuns[0] ?? null;
        const assetCriticFeedback = criticFeedbackByAsset.get(asset.id) ?? [];
        const averageRating = assetFeedback.length
          ? assetFeedback.reduce((sum, item) => sum + item.rating, 0) / assetFeedback.length
          : null;
        const generationTimeMs = job ? new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime() : null;
        return {
          id: asset.id,
          storyTitle: asset.scene?.project?.title ?? 'Untitled story',
          projectId: asset.projectId,
          sceneId: asset.sceneId,
          sceneTitle: asset.scene?.title ?? 'Scene',
          visualStyle: metadata.visualStyleLabel ?? asset.scene?.project?.visualStyle ?? null,
          provider: asset.provider,
          actualProviderModel: metadata.actualProviderModel ?? asset.model,
          requestedModel: metadata.requestedModel ?? job?.model ?? asset.model,
          enhancerProvider: metadata.promptEnhancerProvider ?? null,
          enhancerModel: metadata.promptEnhancerModel ?? null,
          promptEnhancementEnabled: Boolean(metadata.promptEnhancerProvider),
          promptLength: asset.composedPrompt?.length ?? job?.prompt?.length ?? 0,
          generationTimeMs,
          creditsUsed: job?.creditsUsed ?? 0,
          regenerated: (countByScene.get(asset.sceneId) ?? 0) > 1,
          finalAssetSelected: asset.isLatest,
          activeForStorybook: asset.scene?.activeImageAssetId === asset.id,
          latestAsset: asset.isLatest,
          favoriteAsset: Boolean(asset.isFavorite),
          creativeStatus: asset.creativeStatus ?? 'DRAFT',
          criticScore: asset.criticScore ?? null,
          criticRecommendation: asset.criticRecommendation ?? null,
          approvedAt: asset.approvedAt ?? null,
          assetVersionCount: countByScene.get(asset.sceneId) ?? 0,
          audienceMode: asset.scene?.project?.audienceMode ?? null,
          storyCompleted: ['STORYBOARDED', 'IN_PRODUCTION', 'PUBLISHED'].includes(asset.scene?.project?.status ?? ''),
          status: asset.status,
          createdAt: asset.createdAt,
          ratingCount: assetFeedback.length,
          averageRating,
          latestComment: assetFeedback.find((item) => item.comment)?.comment ?? null,
          result: {
            assetUrl: asset.assetUrl,
            thumbnailUrl: asset.thumbnailUrl,
            width: asset.width,
            height: asset.height,
            errorMessage: asset.errorMessage,
          },
          critic: latestCriticRun ? {
            id: latestCriticRun.id,
            status: latestCriticRun.status,
            overallScore: latestCriticRun.overallScore,
            recommendation: latestCriticRun.recommendation,
            confidence: latestCriticRun.confidence,
            scores: {
              characterIdentity: latestCriticRun.characterIdentityScore,
              continuity: latestCriticRun.continuityScore,
              composition: latestCriticRun.compositionScore,
              lighting: latestCriticRun.lightingScore,
              emotion: latestCriticRun.emotionScore,
              visualStyle: latestCriticRun.visualStyleScore,
              environment: latestCriticRun.environmentScore,
              storyAlignment: latestCriticRun.storyAlignmentScore,
              sceneClarity: latestCriticRun.sceneClarityScore,
              technicalQuality: latestCriticRun.technicalQualityScore,
            },
            strengths: latestCriticRun.strengths,
            issues: latestCriticRun.issues,
            improvementPlan: latestCriticRun.improvementPlan,
            criticProvider: latestCriticRun.criticProvider,
            criticModel: latestCriticRun.criticModel,
            criticVersion: latestCriticRun.criticVersion,
            specificationVersion: latestCriticRun.specificationVersion,
            promptVersion: latestCriticRun.promptVersion,
            generationVersion: latestCriticRun.generationVersion,
            retryAttempt: latestCriticRun.retryAttempt,
            parentCriticRunId: latestCriticRun.parentCriticRunId,
            resultingAssetId: latestCriticRun.resultingAssetId,
            errorMessage: latestCriticRun.errorMessage,
            createdAt: latestCriticRun.createdAt,
            completedAt: latestCriticRun.completedAt,
            durationMs: latestCriticRun.completedAt ? new Date(latestCriticRun.completedAt).getTime() - new Date(latestCriticRun.createdAt).getTime() : null,
          } : null,
          criticRuns: assetCriticRuns.map((run) => ({
            id: run.id,
            status: run.status,
            overallScore: run.overallScore,
            recommendation: run.recommendation,
            retryAttempt: run.retryAttempt,
            parentCriticRunId: run.parentCriticRunId,
            resultingAssetId: run.resultingAssetId,
            createdAt: run.createdAt,
          })),
          criticFeedback: assetCriticFeedback.map((item) => ({
            id: item.id,
            rating: item.rating,
            categories: item.categories,
            hasComment: Boolean(item.comment),
            createdAt: item.createdAt,
          })),
          expanded: {
            deterministicPrompt: metadata.deterministicPrompt ?? null,
            enhancedPrompt: job?.prompt ?? asset.composedPrompt ?? null,
            negativePrompt: asset.negativePrompt ?? job?.negativePrompt ?? null,
            providerMetadata: metadata,
            generationResult: {
              providerJobId: job?.providerJobId ?? null,
              outputUrl: job?.outputUrl ?? asset.assetUrl,
              thumbnailUrl: job?.thumbnailUrl ?? asset.thumbnailUrl,
              status: job?.status ?? asset.status,
            },
          },
        };
      });

      const summaryMap = new Map<string, {
        visualStyle: string;
        enhancerProvider: string;
        actualProviderModel: string;
        count: number;
        ratingTotal: number;
        ratingCount: number;
        regenerationTotal: number;
        generationTimeTotal: number;
        generationTimeCount: number;
      }>();

      for (const row of rows) {
        const key = `${row.visualStyle ?? 'Unknown'}|${row.enhancerProvider ?? 'none'}|${row.actualProviderModel ?? 'unknown'}`;
        const existing = summaryMap.get(key) ?? {
          visualStyle: row.visualStyle ?? 'Unknown',
          enhancerProvider: row.enhancerProvider ?? 'none',
          actualProviderModel: row.actualProviderModel ?? 'unknown',
          count: 0,
          ratingTotal: 0,
          ratingCount: 0,
          regenerationTotal: 0,
          generationTimeTotal: 0,
          generationTimeCount: 0,
        };
        existing.count += 1;
        if (row.averageRating !== null) {
          existing.ratingTotal += row.averageRating;
          existing.ratingCount += 1;
        }
        existing.regenerationTotal += row.regenerated ? 1 : 0;
        if (row.generationTimeMs !== null) {
          existing.generationTimeTotal += row.generationTimeMs;
          existing.generationTimeCount += 1;
        }
        summaryMap.set(key, existing);
      }

      const summaries = Array.from(summaryMap.values())
        .map((item) => ({
          visualStyle: item.visualStyle,
          enhancerProvider: item.enhancerProvider,
          actualProviderModel: item.actualProviderModel,
          count: item.count,
          averageRating: item.ratingCount ? item.ratingTotal / item.ratingCount : null,
          averageRegenerations: item.count ? item.regenerationTotal / item.count : 0,
          averageGenerationTimeMs: item.generationTimeCount ? item.generationTimeTotal / item.generationTimeCount : null,
        }))
        .sort((a, b) => (b.averageRating ?? -Infinity) - (a.averageRating ?? -Infinity));

      const completedCriticRuns = (criticRuns as any[]).filter((run) => run.status === 'COMPLETED');
      const retryRuns = (criticRuns as any[]).filter((run) => (run.retryAttempt ?? 0) > 0);
      const scoreImprovements = (criticRuns as any[])
        .filter((run) => run.parentCriticRunId && run.overallScore !== null)
        .map((run) => {
          const parent = (criticRuns as any[]).find((item) => item.id === run.parentCriticRunId);
          return parent?.overallScore !== null && parent?.overallScore !== undefined ? run.overallScore - parent.overallScore : null;
        })
        .filter((value): value is number => typeof value === 'number');
      const criticDurations = completedCriticRuns
        .map((run) => run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime() : null)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const disagreementCount = (criticFeedback as any[]).filter((feedbackItem) => {
        const asset = assets.find((item: any) => item.id === feedbackItem.assetId);
        return (asset?.criticRecommendation === 'APPROVE' && feedbackItem.rating !== 'UP')
          || (asset?.criticRecommendation === 'REGENERATE' && feedbackItem.rating === 'UP');
      }).length;
      const criticSummary = {
        completed: completedCriticRuns.length,
        skipped: (criticRuns as any[]).filter((run) => run.status === 'SKIPPED').length,
        failed: (criticRuns as any[]).filter((run) => run.status === 'FAILED').length,
        averageDurationMs: criticDurations.length ? criticDurations.reduce((sum, value) => sum + value, 0) / criticDurations.length : null,
        averageOverallScore: completedCriticRuns.length ? completedCriticRuns.reduce((sum, run) => sum + (run.overallScore ?? 0), 0) / completedCriticRuns.length : null,
        retryRate: (criticRuns as any[]).length ? retryRuns.length / (criticRuns as any[]).length : 0,
        retrySuccessRate: retryRuns.length ? retryRuns.filter((run) => run.recommendation === 'APPROVE').length / retryRuns.length : 0,
        averageScoreImprovement: scoreImprovements.length ? scoreImprovements.reduce((sum, value) => sum + value, 0) / scoreImprovements.length : null,
        criticHumanDisagreementRate: (criticFeedback as any[]).length ? disagreementCount / (criticFeedback as any[]).length : 0,
      };

      return { rangeDays: input.days, rows, summaries, criticSummary };
    }),

  characterInsights: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(10).max(200).default(120) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const [characters, projects, assets, feedback] = await Promise.all([
        (ctx.prisma as any).storyCharacterMemory.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          include: { project: { select: { id: true, title: true, visualStyle: true, audienceMode: true } } },
        }),
        (ctx.prisma as any).storyProject.findMany({
          where: { createdAt: { gte: since } },
          select: { id: true, title: true, visualStyle: true, _count: { select: { characterMemory: true } } },
        }),
        (ctx.prisma as any).storySceneAsset.findMany({
          where: { createdAt: { gte: since }, assetType: { in: ['IMAGE', 'VIDEO'] } },
          select: { id: true, projectId: true, sceneId: true, assetType: true, isLatest: true },
        }),
        (ctx.prisma as any).promptQualityFeedback.findMany({
          where: { createdAt: { gte: since } },
          select: { assetId: true, rating: true },
        }),
      ]);

      const label = (value?: string | null) =>
        value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase()) : null;
      const topValues = (values: Array<string | null | undefined>, limit = 10) => {
        const counts = new Map<string, number>();
        for (const value of values) {
          const key = value?.trim();
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
      };
      const characterTraits = (character: any) =>
        Array.isArray(character.personalityTraits) ? character.personalityTraits.filter((item: unknown): item is string => typeof item === 'string') : [];
      const relationships = (character: any) =>
        Array.isArray(character.relationships) ? character.relationships.filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
      const assetIdsByProject = assets.reduce((map: Map<string, string[]>, asset: any) => {
        const list = map.get(asset.projectId) ?? [];
        list.push(asset.id);
        map.set(asset.projectId, list);
        return map;
      }, new Map<string, string[]>());
      const feedbackByAsset = feedback.reduce((map: Map<string, number[]>, item: any) => {
        const list = map.get(item.assetId) ?? [];
        list.push(item.rating);
        map.set(item.assetId, list);
        return map;
      }, new Map<string, number[]>());
      const combinationMap = new Map<string, { personality: string; visualStyle: string; count: number; ratingTotal: number; ratingCount: number }>();
      for (const character of characters) {
        for (const trait of characterTraits(character)) {
          const visualStyle = character.project?.visualStyle ?? 'Unknown';
          const key = `${trait}|${visualStyle}`;
          const entry = combinationMap.get(key) ?? { personality: label(trait) ?? trait, visualStyle, count: 0, ratingTotal: 0, ratingCount: 0 };
          entry.count += 1;
          for (const assetId of assetIdsByProject.get(character.projectId) ?? []) {
            for (const rating of feedbackByAsset.get(assetId) ?? []) {
              entry.ratingTotal += rating;
              entry.ratingCount += 1;
            }
          }
          combinationMap.set(key, entry);
        }
      }

      const totalCharacters = characters.length;
      const totalProjects = projects.length || 1;
      const averageCharactersPerStory = projects.reduce((sum: number, project: any) => sum + (project._count?.characterMemory ?? 0), 0) / totalProjects;
      const averageImagesPerCharacter = totalCharacters ? assets.filter((asset: any) => asset.assetType === 'IMAGE').length / totalCharacters : 0;
      const regenerationRateByPersonality = topValues(characters.flatMap(characterTraits)).map((item) => {
        const matchingCharacters = characters.filter((character: any) => characterTraits(character).includes(item.name));
        const projectIds = new Set(matchingCharacters.map((character: any) => character.projectId));
        const projectAssets = assets.filter((asset: any) => projectIds.has(asset.projectId));
        const scenes = new Map<string, number>();
        for (const asset of projectAssets) scenes.set(asset.sceneId, (scenes.get(asset.sceneId) ?? 0) + 1);
        const regeneratedScenes = Array.from(scenes.values()).filter((count) => count > 1).length;
        return { personality: label(item.name) ?? item.name, count: item.count, regenerationRate: scenes.size ? regeneratedScenes / scenes.size : 0 };
      });

      return {
        rangeDays: input.days,
        cards: {
          totalCharacters,
          averageCharactersPerStory,
          averageImagesPerCharacter,
          totalRelationships: characters.reduce((sum: number, character: any) => sum + relationships(character).length, 0),
        },
        popular: {
          personalities: topValues(characters.flatMap(characterTraits)).map((item) => ({ ...item, name: label(item.name) ?? item.name })),
          goals: topValues(characters.map((character: any) => character.goal)).map((item) => ({ ...item, name: label(item.name) ?? item.name })),
          fears: topValues(characters.map((character: any) => character.fear)).map((item) => ({ ...item, name: label(item.name) ?? item.name })),
          relationshipTypes: topValues(characters.flatMap((character: any) => relationships(character).map((relationship: Record<string, unknown>) => typeof relationship.type === 'string' ? relationship.type : null))).map((item) => ({ ...item, name: label(item.name) ?? item.name })),
        },
        regenerationRateByPersonality,
        successfulCombinations: Array.from(combinationMap.values())
          .map((item) => ({
            personality: item.personality,
            visualStyle: item.visualStyle,
            count: item.count,
            averageRating: item.ratingCount ? item.ratingTotal / item.ratingCount : null,
          }))
          .sort((a, b) => (b.averageRating ?? -Infinity) - (a.averageRating ?? -Infinity))
          .slice(0, 12),
        recentCharacters: characters.slice(0, 30).map((character: any) => ({
          id: character.id,
          name: character.name,
          projectTitle: character.project?.title ?? 'Untitled story',
          visualStyle: character.project?.visualStyle ?? null,
          traits: characterTraits(character).map((trait: string) => label(trait) ?? trait),
          goal: label(character.goal),
          fear: label(character.fear),
          motivation: label(character.motivation),
          walkingStyle: label(character.walkingStyle),
          relationships: relationships(character).length,
          evolutionStage: character.evolutionStage,
        })),
      };
    }),

  // ─── User Management ────────────────────────────────────────────────────────

  /**
   * List users with search, filter by role/tier, and pagination.
   */
  listUsers: moderatorProcedure
    .input(z.object({
      search:   z.string().optional(),
      role:     z.enum(['VIEWER', 'CREATOR', 'MODERATOR', 'ADMIN']).optional(),
      tier:     z.enum(['FREE', 'VIEWER', 'CREATOR']).optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const where = {
        ...(input.search && {
          OR: [
            { email:       { contains: input.search, mode: 'insensitive' as const } },
            { username:    { contains: input.search, mode: 'insensitive' as const } },
            { displayName: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }),
        ...(input.role && { role: input.role }),
        ...(input.tier && { premiumTier: input.tier }),
      };

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          skip,
          take: input.pageSize,
          orderBy: { createdAt: 'desc' },
          select: {
            id:           true,
            email:        true,
            username:     true,
            displayName:  true,
            avatarUrl:    true,
            role:         true,
            premiumTier:  true,
            verified:     true,
            followerCount:true,
            totalViews:   true,
            createdAt:    true,
            creditBalance: { select: { balance: true } },
            _count: {
              select: { videos: true, generationJobs: true },
            },
          },
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          creditBalance: u.creditBalance?.balance ?? 0,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Get a single user's full admin details.
   */
  getUser: moderatorProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          creditBalance: true,
          _count: {
            select: {
              videos: true,
              generationJobs: true,
              followers: true,
              following: true,
            },
          },
        },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      // Recent credit transactions
      const recentTx = await ctx.prisma.creditTransaction.findMany({
        where:   { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take:    20,
      });

      return { user, recentTx };
    }),

  /**
   * Update a user's role (ADMIN only).
   */
  setUserRole: adminProcedure
    .input(z.object({
      userId: z.string(),
      role:   z.enum(['VIEWER', 'CREATOR', 'MODERATOR', 'ADMIN']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Prevent demoting yourself
      if (input.userId === ctx.user.id && input.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot demote yourself' });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data:  { role: input.role },
      });

      return { success: true };
    }),

  /**
   * Manually adjust a user's credit balance (add or deduct).
   */
  findCreditUser: adminProcedure
    .input(z.object({ lookup: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const lookup = input.lookup.trim();
      const user = await ctx.prisma.user.findFirst({
        where: {
          OR: [
            { id: lookup },
            { email: { equals: lookup, mode: 'insensitive' } },
            { username: { equals: lookup.replace(/^@/, ''), mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          creditBalance: { select: { balance: true } },
        },
      });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      return {
        ...user,
        creditBalance: user.creditBalance?.balance ?? 0,
      };
    }),

  adjustCredits: adminProcedure
    .input(z.object({
      userId:      z.string().optional(),
      lookup:      z.string().max(200).optional(),
      amount:      z.number().int(), // positive = add, negative = deduct
      action:      z.enum(['gift', 'refund', 'deduct']).optional(),
      description: z.string().min(1, 'Reason required'),
      referenceId: z.string().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { amount, description } = input;
      if (!input.userId && !input.lookup?.trim()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User ID, email, or username is required' });
      }

      const user = input.userId
        ? await ctx.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } })
        : await ctx.prisma.user.findFirst({
          where: {
            OR: [
              { id: input.lookup!.trim() },
              { email: { equals: input.lookup!.trim(), mode: 'insensitive' } },
              { username: { equals: input.lookup!.trim().replace(/^@/, ''), mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const userId = user.id;
      const action = input.action ?? (amount >= 0 ? 'gift' : 'deduct');
      if (action === 'gift' && amount <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Gift amount must be positive' });
      }
      if (action === 'refund' && amount <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Refund amount must be positive' });
      }
      if (action === 'deduct' && amount >= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Deduction amount must be negative' });
      }

      // Get or create balance record
      const existing = await ctx.prisma.creditBalance.findUnique({ where: { userId } });
      const before   = existing?.balance ?? 0;
      const after    = Math.max(0, before + amount); // floor at 0

      await ctx.prisma.$transaction([
        ctx.prisma.creditBalance.upsert({
          where:  { userId },
          create: { userId, balance: after },
          update: { balance: after },
        }),
        ctx.prisma.creditTransaction.create({
          data: {
            userId,
            amount:        after - before, // actual delta (may differ if floored)
            type:          action === 'refund' ? 'REFUND' : amount > 0 ? 'BONUS' : 'USAGE',
            description:   `[Admin: ${ctx.user.username}] ${description}`,
            referenceId:   input.referenceId,
            balanceBefore: before,
            balanceAfter:  after,
          },
        }),
      ]);

      return { before, after, delta: after - before };
    }),

  /**
   * Ban / unban a user (lock their account indefinitely).
   */
  setUserBan: adminProcedure
    .input(z.object({
      userId: z.string(),
      banned: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot ban yourself' });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: {
          lockedUntil: input.banned
            ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // ~100 years
            : null,
        },
      });

      return { success: true };
    }),

  // ─── Credit Rate Management ─────────────────────────────────────────────────

  /**
   * List all feature credit rates.
   */
  listCreditRates: moderatorProcedure.query(async ({ ctx }) => {
    return ctx.prisma.featureCreditRate.findMany({
      orderBy: [{ isActive: 'desc' }, { featureKey: 'asc' }],
    });
  }),

  /**
   * Update a feature's credit cost.
   */
  updateCreditRate: adminProcedure
    .input(z.object({
      id:            z.string(),
      creditsPerUnit: z.number().int().min(0),
      isActive:      z.boolean().optional(),
      description:   z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.featureCreditRate.update({
        where: { id },
        data,
      });
    }),

  /**
   * Create a new credit rate entry.
   */
  createCreditRate: adminProcedure
    .input(z.object({
      featureKey:    z.string().min(1),
      creditsPerUnit: z.number().int().min(0),
      unitLabel:     z.string().default('request'),
      description:   z.string().optional(),
      isActive:      z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.featureCreditRate.create({ data: input });
    }),

  // ─── Generation Jobs ────────────────────────────────────────────────────────

  /**
   * List recent generation jobs across all users.
   */
  listGenerationJobs: moderatorProcedure
    .input(z.object({
      status:   z.enum(['QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
      model:    z.enum(['NANO_BANANA', 'GROK_IMAGINE', 'LTX2', 'WAN_25', 'KLING', 'HIGGSFIELD', 'VEO3']).optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip  = (input.page - 1) * input.pageSize;
      const where = {
        ...(input.status && { status: input.status }),
        ...(input.model  && { model:  input.model  }),
      };

      const [jobs, total] = await Promise.all([
        ctx.prisma.generationJob.findMany({
          where,
          skip,
          take:    input.pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true },
            },
          },
        }),
        ctx.prisma.generationJob.count({ where }),
      ]);

      return {
        jobs,
        total,
        page:       input.page,
        pageSize:   input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  // ─── Content Moderation ────────────────────────────────────────────────────

  /**
   * List videos pending moderation review.
   * Moderators and admins can access this.
   */
  moderationQueue: moderatorProcedure
    .input(z.object({
      status:   z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED']).default('PENDING'),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const [videos, total] = await Promise.all([
        ctx.prisma.video.findMany({
          where: { moderationStatus: input.status },
          skip,
          take: input.pageSize,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            mp4Url: true,
            tags: true,
            status: true,
            moderationStatus: true,
            isKidsSafe: true,
            contentRating: true,
            createdAt: true,
            creator: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
            },
            moderationLogs: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        }),
        ctx.prisma.video.count({ where: { moderationStatus: input.status } }),
      ]);

      return {
        videos,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Approve / reject / flag a video.
   */
  moderateVideo: moderatorProcedure
    .input(z.object({
      videoId: z.string(),
      action:  z.enum(['approve', 'reject', 'flag']),
      reason:  z.string().max(500).optional(),
      isKidsSafe:    z.boolean().optional(),
      contentRating: z.enum(['G', 'PG', 'PG-13', 'R']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({ where: { id: input.videoId } });
      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found' });

      const moderationStatus =
        input.action === 'approve' ? 'APPROVED' :
        input.action === 'reject'  ? 'REJECTED'  :
        'FLAGGED';

      // For rejected videos, also block them from the feed
      const statusUpdate = input.action === 'reject' ? { status: 'BLOCKED' as const } : {};

      await ctx.prisma.$transaction([
        ctx.prisma.video.update({
          where: { id: input.videoId },
          data: {
            moderationStatus,
            ...(input.isKidsSafe    !== undefined ? { isKidsSafe: input.isKidsSafe }       : {}),
            ...(input.contentRating !== undefined ? { contentRating: input.contentRating } : {}),
            ...statusUpdate,
          },
        }),
        ctx.prisma.moderationLog.create({
          data: {
            videoId:     input.videoId,
            moderatorId: ctx.user.id,
            action:      input.action,
            reason:      input.reason,
            automated:   false,
          },
        }),
      ]);

      return { success: true, moderationStatus };
    }),

  /**
   * Get moderation stats for the overview.
   */
  getModerationStats: moderatorProcedure.query(async ({ ctx }) => {
    const [pending, approved, rejected, flagged] = await Promise.all([
      ctx.prisma.video.count({ where: { moderationStatus: 'PENDING' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'APPROVED' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'REJECTED' } }),
      ctx.prisma.video.count({ where: { moderationStatus: 'FLAGGED' } }),
    ]);
    return { pending, approved, rejected, flagged };
  }),

  // ─── Revenue / Transaction History ─────────────────────────────────────────

  /**
   * List credit purchase transactions for revenue view.
   */
  listPurchases: moderatorProcedure
    .input(z.object({
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const [txs, total, totals] = await Promise.all([
        ctx.prisma.creditTransaction.findMany({
          where:   { type: 'PURCHASE' },
          skip,
          take:    input.pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        }),
        ctx.prisma.creditTransaction.count({ where: { type: 'PURCHASE' } }),
        ctx.prisma.creditTransaction.aggregate({
          where: { type: 'PURCHASE' },
          _sum:  { amount: true },
          _count: { id: true },
        }),
      ]);

      return {
        transactions: txs,
        total,
        totalPages: Math.ceil(total / input.pageSize),
        page:       input.page,
        pageSize:   input.pageSize,
        allTimeCreditsSold:   totals._sum.amount ?? 0,
        allTimeTransactions:  totals._count.id,
      };
    }),
});
