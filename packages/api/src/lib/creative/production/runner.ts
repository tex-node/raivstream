/**
 * Raivstream 5.0 — Production runner.
 *
 * Executes an APPROVED plan through the GenerationAdapter (CapabilityRouter
 * decides what/how; the adapter talks to existing generation infra). Detached
 * from the request; resumable (skips READY assets); partial failures are
 * recorded per asset and never stop the remaining scenes; credits are charged
 * per generation and refunded on failure (existing convention).
 *
 * Phase 9 reliability hardening:
 *  - a durable `CreativeProductionRun` row (heartbeat, attempt, stage, counts),
 *  - idempotent operations (an in-flight run is never started twice),
 *  - bounded per-asset retry (transient provider failures recover in-run),
 *  - stale-run recovery after a process restart (heartbeat based),
 *  - structured, safe production observability.
 *
 * Dependencies are injectable so the control flow is unit-testable without
 * providers.
 */

import type { PrismaClient } from '@raivstream/database';
import { chargeOrThrow, refundCredits, MODEL_FEATURE_KEY } from '../../credits';
import { nextChargeAttempt } from '../../credits/attempts';
import { CreditCapExceededError, assertWithinCeiling, capStopReason, finalRunStatus, loadRunBudget } from '../../credits/cap';
import { applySoftenedPrompt, decideAfterRejection, dropReason, netSpendAfterRefund } from './moderationFallback';
import { preflightDecision, preflightRecord } from './preflight';
import { readyPatch } from './assetPatch';
import { moderatePrompt, suggestSafeRewrite as suggestRewriteForPreflight } from '../../promptModeration';
import { suggestSafeRewrite } from '../../promptModeration';
import { creditKeys } from '../../credits/idempotencyKeys';
import type { CreativeBibleState } from '../shared/types';
import { CreativeError } from '../shared/errors';
import { MediaProviderError } from '../../mediaProviders/types';
import { routeProduction, type GenerationSpec, type StillSpec, type VideoSpec } from './capabilityRouter';
import { composeWithLook, lookPromptForProduction } from '../look/service';
import { generateStill, generateVideo, extractLastFrame, type GeneratedMedia } from './generationAdapter';
import type { CreativeProductionPlanState } from './plan';
import { logStage } from '../stageLog';
import { logProductionEvent } from '../observability/metrics';
import {
  applyIdentityFraming,
  composeCreativeIdentityBlock,
  resolveCreativeReferences,
  withIdentityBlock,
  type CreativeCharacterRef,
} from './identityBlock';
import { outputService } from '../output/service';

export interface ProductionDeps {
  generateStill: (spec: StillSpec, projectId: string, assetId: string) => Promise<GeneratedMedia>;
  generateVideo: (spec: VideoSpec, projectId: string, assetId: string, seedImageUrl?: string) => Promise<GeneratedMedia>;
  extractLastFrame: (videoUrl: string, keyPrefix: string) => Promise<string | null>;
}

const defaultDeps: ProductionDeps = { generateStill, generateVideo, extractLastFrame };

/** A run with no heartbeat for this long is considered abandoned (process restart). */
export const STALE_RUN_MS = 5 * 60 * 1000;
/** Bounded retry per asset — transient provider failures recover without user action. */
export const DEFAULT_MAX_ATTEMPTS = 2;

export type ProductionRunStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface ProductionRunResult {
  generated: number;
  failed: number;
  runId: string | null;
  status: ProductionRunStatus;
}

export interface ProductionRunOptions {
  /**
   * Per-shot production (2026-11-04). The runner previously called
   * `routeProduction(plan, bible)` with no options, so per-shot specs were unreachable from the
   * only path that resolves `characterRefs` into `referenceImageUrls` — the reason every earlier
   * experiment had to call `generateStill` directly and lost conditioning.
   */
  perShot?: boolean;
  /** Restrict a run to specific scenes. Experiments need one scene, not the whole film. */
  sceneIds?: string[];
  /**
   * A saved look to apply to every still in this run (Phase 5). Read back from the project by
   * name - the production never re-enters lens/grade/movement, which is what "reusable" means.
   */
  lookName?: string;
  /**
   * Per-run credit ceiling (Phase 7). Persisted on the run so a resumed attempt remembers its
   * budget; null means uncapped.
   */
  creditCeiling?: number;
  /** Restrict a run to specific spec kinds, so an image comparison does not also buy video. */
  kinds?: Array<'IMAGE' | 'VIDEO'>;

  maxAttempts?: number;
  now?: () => Date;
}

type ExistingAsset = { id: string; sceneId: string; kind: string; status: string; assetUrl: string | null };

type RunModel = {
  create?: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  update?: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  findFirst?: (args: Record<string, unknown>) => Promise<{ id: string; status: string; heartbeatAt: Date } | null>;
  findMany?: (args: Record<string, unknown>) => Promise<Array<{ id: string; projectId: string; status: string; heartbeatAt: Date }>>;
};

function runModel(prisma: PrismaClient): RunModel | null {
  const model = (prisma as unknown as { creativeProductionRun?: RunModel }).creativeProductionRun;
  return model && typeof model.create === 'function' ? model : null;
}

async function startRun(prisma: PrismaClient, projectId: string, input: { totalScenes: number; attempt: number; contextSnapshot?: unknown }): Promise<string | null> {
  const model = runModel(prisma);
  if (!model?.create) return null;
  try {
    const run = await model.create({
      data: {
        projectId,
        status: 'RUNNING',
        attempt: input.attempt,
        totalScenes: input.totalScenes,
        stage: 'creating_scenes',
        contextSnapshot: input.contextSnapshot ?? undefined,
      },
    });
    return run.id;
  } catch {
    return null;
  }
}

async function heartbeat(prisma: PrismaClient, runId: string | null, data: Record<string, unknown>, now: () => Date): Promise<void> {
  if (!runId) return;
  const model = runModel(prisma);
  if (!model?.update) return;
  await model.update({ where: { id: runId }, data: { ...data, heartbeatAt: now() } }).catch(() => undefined);
}

export async function runCreativeProduction(
  prisma: PrismaClient,
  input: { projectId: string; runId?: string; attempt?: number },
  deps: ProductionDeps = defaultDeps,
  options: ProductionRunOptions = {},
): Promise<ProductionRunResult> {
  const now = options.now ?? (() => new Date());
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  const project = await prisma.creativeProject.findUnique({
    where: { id: input.projectId },
    include: { productionPlan: true, bible: true },
  });
  if (!project || !project.productionPlan) return { generated: 0, failed: 0, runId: input.runId ?? null, status: 'FAILED' };

  const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
  const bible = project.bible as unknown as CreativeBibleState | null;
  const allSpecs: GenerationSpec[] = routeProduction(plan, bible, null, { perShot: options.perShot });
  const specs: GenerationSpec[] = allSpecs.filter(
    (spec) =>
      (!options.sceneIds || options.sceneIds.includes(spec.sceneId)) &&
      (!options.kinds || options.kinds.includes(spec.kind as 'IMAGE' | 'VIDEO')),
  );
  const existing = (await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } })) as unknown as ExistingAsset[];
  // Resume key includes the shot (2026-11-04). Without it, a per-shot spec is considered
  // already produced the moment the scene has any IMAGE asset: `SCENE_01:IMAGE` matched the
  // scene-level composite, so every shot spec was skipped and a per-shot run generated 0
  // assets while reporting COMPLETED.
  const byKey = new Map(
    existing.map((asset) => [
      `${asset.sceneId}:${(asset as { shotId?: string | null }).shotId ?? '-'}:${asset.kind}`,
      asset,
    ]),
  );

  // Resolve the saved look once per run, so every still carries the same fragment.
  let lookFragment: string | null = null;
  if (options.lookName) {
    const resolved = await lookPromptForProduction(prisma as never, { projectId: project.id, name: options.lookName });
    lookFragment = resolved?.fragment ?? null;
  }

  const runId = input.runId ?? (await startRun(prisma, project.id, { totalScenes: plan.scenes.length, attempt: input.attempt ?? 1, contextSnapshot: plan.contextSnapshot }));

  // A ceiling is written once, then read back from the row: the run's budget must survive a resume.
  if (options.creditCeiling !== undefined && runId) {
    await prisma.creativeProductionRun.update({
      where: { id: runId },
      data: { creditCeiling: options.creditCeiling } as never,
    }).catch(() => undefined);
  }
  let budget = await loadRunBudget(prisma, runId).catch(() => ({ ceiling: null, spent: 0 }));
  const startedAt = now().getTime();
  logProductionEvent({ type: 'run_started', projectId: project.id, runId, totalScenes: plan.scenes.length, attempt: input.attempt ?? 1 });

  let lastClipUrl: string | null = null;
  let generated = 0;
  let failed = 0;
  // Set when the ceiling refuses a charge: the run must report PARTIAL, not COMPLETED.
  let capHit: { ceiling: number; spent: number; assetIndex: number } | null = null;
  // Scenes dropped by the moderation fallback: recorded so the run reports PARTIAL with a gap
  // rather than COMPLETED with a silent hole.
  const droppedScenes = new Set<string>();
  // One softened retry per asset, never a loop.
  const moderationRetried = new Set<string>();
  // A still's softened rewrite must reach the same scene's video, or the video retries the phrase
  // that was just rejected.
  const sceneSoftened = new Map<string, { original: string; softened: string }>();
  // Structured instrumentation: these survive the outer failure handler, unlike errorMessage.
  const droppedAssets: Array<{ sceneId: string; kind: string; reason: string }> = [];
  let moderationRetries = 0;
  let firstVisualLogged = false;
  // The same source readiness approved: a resolvable reference the generation
  // capability (H3 I2V) can actually use as the opening seed.
  const sourceSeedUrl = plan.sourceReferences?.find((ref) => Boolean(ref.url))?.url;

  try {
    for (const spec of specs) {
      const key = `${spec.sceneId}:${(spec as StillSpec).shotId ?? '-'}:${spec.kind}`;
      const prior = byKey.get(key);
      if (prior && prior.status === 'READY') {
        if (spec.kind === 'VIDEO' && prior.assetUrl) lastClipUrl = prior.assetUrl;
        continue;
      }

      // Reuse a prior non-READY asset row (resumability + retry-only-affected):
      // never create a duplicate for the same scene+kind.
      // A dropped scene cannot seed a video: record the skip instead of failing for want of a seed.
      if (spec.kind === 'VIDEO' && droppedScenes.has(spec.sceneId)) {
        failed += 1;
        console.info(`[creative.moderation] scene=${spec.sceneId} action=skip_video reason=scene_dropped`);
        await prisma.creativeProducedAsset
          .create({ data: { projectId: project.id, sceneId: spec.sceneId, shotId: null, kind: spec.kind, status: 'FAILED', errorMessage: dropReason(spec.kind) } as never })
          .catch(() => undefined);
        continue;
      }

      const asset = prior
        ? await prisma.creativeProducedAsset.update({ where: { id: prior.id }, data: { status: 'GENERATING' as never } })
        : await prisma.creativeProducedAsset.create({ data: { projectId: project.id, sceneId: spec.sceneId, shotId: (spec as StillSpec).shotId ?? null, kind: spec.kind, status: 'GENERATING', versionId: project.currentVersionId ?? null } as never });

      let seedImageUrl: string | undefined;
      if (spec.kind === 'VIDEO') {
        // Carry a still's softened rewrite into the video prompt: same scene text, same flag.
        (spec as { prompt: string }).prompt = applySoftenedPrompt(
          (spec as { prompt: string }).prompt,
          sceneSoftened.get(spec.sceneId),
        );
        // VIDEO is always scene-level, so its seed still is the scene key, never a shot key.
        const still = byKey.get(`${spec.sceneId}:-:IMAGE`);
        if (sourceSeedUrl) {
          // Source-conditioned project (product photo uploaded): prefer the scene's
          // own generated still — it already encodes the source identity via FLUX
          // Kontext and has the correct composition for this scene. Fall back to the
          // last-frame chain when the still failed, and ultimately to the raw source.
          if (still?.assetUrl) {
            seedImageUrl = still.assetUrl;
          } else if (lastClipUrl) {
            const chained = await deps.extractLastFrame(lastClipUrl, `creative/${project.id}/scenes/${spec.sceneId}/seeds`).catch(() => null);
            seedImageUrl = chained ?? sourceSeedUrl;
          } else {
            seedImageUrl = sourceSeedUrl;
          }
        } else if (lastClipUrl) {
          // Non-source-conditioned: last-frame chain preserves narrative continuity.
          const chained = await deps.extractLastFrame(lastClipUrl, `creative/${project.id}/scenes/${spec.sceneId}/seeds`).catch(() => null);
          seedImageUrl = chained ?? still?.assetUrl ?? undefined;
        } else {
          seedImageUrl = still?.assetUrl ?? undefined;
        }
        // Production integrity invariant: H3_MAX is an image-to-video model and
        // always requires a seed image. A missing seed means neither the scene still,
        // chained last frame, nor the source reference was available.
        // Fail the asset deterministically — never retry, never let the provider
        // emit a cryptic error that masks the root cause.
        if (seedImageUrl === undefined) {
          const msg = 'MiniMax H3-Max is an image-to-video model and requires a seed image. No seed was resolved for this scene.';
          await prisma.creativeProducedAsset.update({ where: { id: asset.id }, data: { status: 'FAILED' as never, errorMessage: msg } });
          failed += 1;
          logProductionEvent({ type: 'asset_failed', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt: 1, final: true, message: 'MISSING_SOURCE: no seed resolved' });
          await heartbeat(prisma, runId, { readyScenes: byKey.size, failedScenes: failed }, now);
          continue;
        }
      }

      const featureKey = spec.kind === 'IMAGE' ? MODEL_FEATURE_KEY.FLUX2 : MODEL_FEATURE_KEY.H3_MAX;
      let lastError: Error | null = null;
      // PRE-FLIGHT (2026-11-06): moderation is free, generation is not. Check the composed prompt
      // BEFORE the ceiling guard and the charge, so a refusal costs nothing and a prompt that can
      // pass is made to pass first.
      {
        let moderation = await moderatePrompt((spec as StillSpec).prompt).catch(() => ({ allowed: true }) as never);
        let softenedOnce = false;
        for (let pass = 0; pass < 2; pass += 1) {
          const rewrite = moderation.allowed ? null : await suggestRewriteForPreflight((spec as StillSpec).prompt).catch(() => null);
          const decision = preflightDecision({
            initial: moderation as never,
            rewritten: (rewrite as { safeRewrite?: string } | null)?.safeRewrite ?? null,
            alreadySoftened: softenedOnce,
          });
          if (decision.action === 'pass') break;
          if (decision.action === 'softened') {
            (spec as { prompt: string }).prompt = decision.prompt;
            softenedOnce = true;
            moderationRetries += 1;
            console.info(
              `[creative.moderation] preflight=softened kind=${spec.kind} softenedChars=${decision.prompt.length}`,
            );
            moderation = await moderatePrompt(decision.prompt).catch(() => ({ allowed: true }) as never);
            continue;
          }
          console.info(`[creative.moderation] preflight=refused kind=${spec.kind} reason=${String(decision.reason).slice(0, 40)}`);
          await prisma.creativeProducedAsset.update({
            where: { id: asset.id },
            data: { status: 'FAILED' as never, errorMessage: preflightRecord(spec.kind, decision.reason) } as never,
          });
          failed += 1;
          lastError = new Error(preflightRecord(spec.kind, decision.reason));
          break;
        }
        if (lastError) {
          await heartbeat(prisma, runId, { readyScenes: byKey.size, failedScenes: failed }, now);
          continue;
        }
      }


      let ready = false;

      for (let attempt = 1; attempt <= maxAttempts && !ready; attempt += 1) {
        logProductionEvent({ type: 'asset_started', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt });
        const ref = `creative-produce-${asset.id}-a${attempt}`;
          // No tolerance and no documented zero: a generation that cannot charge fails.
          // A missing FeatureCreditRate is a configuration error, not a free render - the mocks
          // express a rate and a transaction now, so the old excuse for catching is gone.
          // A reused row has already been paid for once; its attempt comes from that history, so
          // the key differs and the re-render is billed. A fresh row starts at the loop attempt.
          const chargeAttempt = prior ? await nextChargeAttempt(prisma, asset.id) : attempt;
          // Checked BEFORE the charge: the cap refuses the next asset rather than reporting an
          // overrun the ledger already recorded.
          const rate = featureKey
            ? ((await prisma.featureCreditRate
                .findUnique({ where: { featureKey }, select: { creditsPerUnit: true } })
                .catch(() => null)) as { creditsPerUnit: number } | null)
            : null;
          assertWithinCeiling({ runId, ceiling: budget.ceiling, spent: budget.spent, nextCost: rate?.creditsPerUnit ?? 0 });
          const creditsUsed = featureKey
            ? await chargeOrThrow(
                prisma,
                project.userId,
                featureKey,
                ref,
                `Creative production: ${spec.sceneId} ${spec.kind.toLowerCase()}`,
                creditKeys.prodAsset.charge(asset.id, chargeAttempt),
              )
            : 0;
          // Persist the spend so a resumed run starts from it, not from zero.
          if (creditsUsed > 0 && runId) {
            budget = { ...budget, spent: budget.spent + creditsUsed };
            await prisma.creativeProductionRun
              .update({ where: { id: runId }, data: { creditsSpent: budget.spent } as never })
              .catch(() => undefined);
          }
        try {
          let media;
          if (spec.kind === 'IMAGE') {
            // Identity conditioning (build step 3). Before this, creative stills were
            // text-to-image with no references at all, which is why no creative output
            // could ever clear the identity floor: the pipeline guaranteed the failure.
            const sceneCharacters = ((spec as StillSpec).characterRefs ?? []) as CreativeCharacterRef[];
            const identityBlock = composeCreativeIdentityBlock(sceneCharacters);
            const referenceImageUrls = await resolveCreativeReferences(prisma, sceneCharacters);
            // Identity-bearing stills get medium framing by default; a beat may override.
            // A saved look (Phase 5) is composed onto the prompt before identity framing, so the
            // look describes the image and framing still governs how the character is held.
            const lookPrompt = lookFragment
              ? composeWithLook((spec as StillSpec).prompt, lookFragment)
              : (spec as StillSpec).prompt;
            if (lookFragment) {
              // Call-site evidence that the stored look reached the payload: this logs the exact
              // fragment about to be composed, at the point of composition, not at save time.
              console.info(
                `[creative.look] scene=${spec.sceneId} name=${options.lookName} fragmentChars=${lookFragment.length} inPrompt=${lookPrompt.includes(lookFragment)}`,
              );
            }
            const framing = applyIdentityFraming(lookPrompt, {
              characters: sceneCharacters,
              wideShotRequired: Boolean((spec as { wideShotRequired?: boolean }).wideShotRequired),
            });
            if (framing.reason === 'beat-override') {
              logStage(project.id, 'produce', 'ok', { scene: spec.sceneId, framing: 'beat-override' });
            }
            const stillSpec: StillSpec = {
              ...(spec as StillSpec),
              prompt: withIdentityBlock(framing.prompt, identityBlock),
              ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            };
            logStage(project.id, 'produce', 'ok', {
              scene: spec.sceneId,
              references: referenceImageUrls.length,
              identityBlock: identityBlock ? 'yes' : 'no',
              framing: framing.reason,
            });
            media = await deps.generateStill(stillSpec, project.id, asset.id);
          } else {
            media = await deps.generateVideo(spec as VideoSpec, project.id, asset.id, seedImageUrl);
          }
          await prisma.creativeProducedAsset.update({
            where: { id: asset.id },
            data: readyPatch({ assetUrl: media.assetUrl, thumbnailUrl: media.thumbnailUrl ?? null, provider: 'internal' }),
          });
          byKey.set(key, { id: asset.id, sceneId: spec.sceneId, kind: spec.kind, status: 'READY', assetUrl: media.assetUrl });
          if (spec.kind === 'VIDEO') lastClipUrl = media.assetUrl;
          generated += 1;
          ready = true;
          logProductionEvent({ type: 'asset_ready', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, durationMs: now().getTime() - startedAt });
          if (spec.kind === 'IMAGE' && !firstVisualLogged) {
            firstVisualLogged = true;
            logProductionEvent({ type: 'asset_ready', projectId: project.id, sceneId: spec.sceneId, kind: 'FIRST_VISUAL', durationMs: now().getTime() - startedAt });
          }
        } catch (error) {
          if (error instanceof CreditCapExceededError) {
            const capped = error;
            // Stop attempting further assets: every remaining charge would be refused the same way.
            capHit = { ceiling: capped.ceiling, spent: capped.spent, assetIndex: specs.indexOf(spec) + 1 };
            failed += 1;
            await prisma.creativeProducedAsset
              .update({ where: { id: asset.id }, data: { status: 'FAILED' as never, errorMessage: capped.code } as never })
              .catch(() => undefined);
            break;
          }
          lastError = error as Error;
          // CONTENT_REJECTED and non-retryable MediaProviderError (e.g. PROVIDER_DISABLED)
          // are deterministic — never retry. Both fail only this asset (smallest scope).
          const rejected = error instanceof CreativeError && error.code === 'CONTENT_REJECTED';
          const providerFinal = error instanceof MediaProviderError && !error.retryable;
          if (creditsUsed > 0 && featureKey) {
            await refundCredits(prisma, project.userId, creditsUsed, featureKey, ref, 'Creative production failed', creditKeys.prodAsset.refund(asset.id, chargeAttempt)).catch(() => undefined);
            // A refunded charge must not count against the ceiling: the money went back, so the
            // run's NET spend drops with it.
            if (runId) {
              budget = { ...budget, spent: netSpendAfterRefund(budget.spent, creditsUsed) };
              await prisma.creativeProductionRun
                .update({ where: { id: runId }, data: { creditsSpent: budget.spent } as never })
                .catch(() => undefined);
            }
          }
          if (rejected && !moderationRetried.has(asset.id)) {
            moderationRetried.add(asset.id);
            const suggestion = await suggestSafeRewrite((spec as StillSpec).prompt).catch(() => null);
            const decision = decideAfterRejection({
              alreadyRetried: false,
              originalPrompt: (spec as StillSpec).prompt,
              rewritten: (suggestion as { safeRewrite?: string } | null)?.safeRewrite ?? null,
            });
            if (decision.action === 'retry') {
              moderationRetries += 1;
              console.info(
                `[creative.moderation] asset=${asset.id} kind=${spec.kind} attempt=${attempt} rewritten=true softenedChars=${decision.prompt.length}`,
              );
              if (spec.kind === 'IMAGE') {
                sceneSoftened.set(spec.sceneId, { original: (spec as StillSpec).prompt, softened: decision.prompt });
              }
              (spec as { prompt: string }).prompt = decision.prompt;

              continue;
            }
          }
          if (rejected) {
            droppedScenes.add(spec.sceneId);
            droppedAssets.push({ sceneId: spec.sceneId, kind: spec.kind, reason: dropReason(spec.kind) });
            console.info(`[creative.moderation] scene=${spec.sceneId} kind=${spec.kind} action=drop reason=moderation_rejected`);
          }
          const isFinal = rejected || providerFinal || attempt >= maxAttempts;
          const logCategory = providerFinal ? `PROVIDER_DISABLED: ${(error as MediaProviderError).code}` : undefined;
          logProductionEvent({ type: 'asset_failed', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt, final: isFinal, message: logCategory ?? lastError.message.slice(0, 200) });
          if (rejected || providerFinal) break;
        }
      }

      if (!ready) {
        await prisma.creativeProducedAsset.update({
          where: { id: asset.id },
          data: {
          status: 'FAILED',
          // A dropped asset keeps its reason: the failure handler is later than the drop and used
          // to erase it, which is why dropped=0 proved nothing after the fourth run.
          errorMessage: droppedScenes.has(spec.sceneId)
            ? dropReason(spec.kind)
            : (lastError?.message ?? 'Generation failed').slice(0, 500),
        },
        });
        failed += 1;
      }

      await heartbeat(prisma, runId, { readyScenes: byKey.size, failedScenes: failed }, now);
    }
  } finally {
    // A capped run is PARTIAL with a machine-readable reason. The cap changed what the run DID;
    // this changes what it SAYS, which is the half that was missing.
    const status: ProductionRunStatus = finalRunStatus({ capHit: Boolean(capHit), generated, failed, droppedScenes: droppedScenes.size });
    const stopReason = capHit
      ? capStopReason({ ceiling: capHit.ceiling, spent: capHit.spent, assetIndex: capHit.assetIndex, totalAssets: specs.length })
      : failed > 0
        ? 'Some scenes could not be generated.'
        : null;
    const model = runModel(prisma);
    if (runId && model?.update) {
      await model.update({
        where: { id: runId },
        data: {
          status,
          readyScenes: generated,
          failedScenes: failed,
          stage: 'ready',
          finishedAt: now(),
          heartbeatAt: now(),
          lastError: stopReason,
          ...(droppedAssets.length > 0 ? { droppedAssets } : {}),
          moderationRetries,
        },
      }).catch(() => undefined);
    }
    logProductionEvent({ type: 'run_finished', projectId: project.id, runId, status, generated, failed });
    // Production completed (fully or partially) — hand off to REVIEW.
    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'REVIEW' as never } }).catch(() => undefined);

    // Auto-assembly: when every scene video succeeded, immediately assemble the
    // final film. Scene videos are concatenated in plan order via FFmpeg and stored
    // as a creativeOutput (PORTRAIT). Errors are swallowed — they do not affect
    // the production result; the UI derives assembly state from creativeOutput status.
    if (failed === 0) {
      await outputService.autoAssemble(prisma, { projectId: project.id, plan }).catch(() => undefined);
    }
  }

  // The returned status must be the one that was persisted: an inline expression here meant the run

  // row said PARTIAL while the caller was told FAILED.

  return { generated, failed, runId, status: finalRunStatus({ capHit: Boolean(capHit), generated, failed, droppedScenes: droppedScenes.size }) } as ProductionRunResult;
}

export interface RecoveryResult {
  recovered: string[];
  alreadyActive: string[];
  stale: string[];
}

/**
 * Reliability hardening (Phase 9): safe recovery after a process restart.
 *
 * The runner is detached and resumable (skips READY assets). If the process
 * dies mid-run the project stays GENERATING with some assets READY. This finds
 * every GENERATING project and re-kicks the runner unless a run is genuinely
 * active (heartbeat fresh AND in-flight assets). It skips READY scenes and
 * produces only what's missing, then lands the project in REVIEW. Idempotent.
 */
export async function recoverStuckProductions(
  prisma: PrismaClient,
  deps: ProductionDeps = defaultDeps,
  options: { now?: () => Date; staleMs?: number; userId?: string } = {},
): Promise<RecoveryResult> {
  const now = options.now ?? (() => new Date());
  const staleMs = options.staleMs ?? STALE_RUN_MS;
  const stuck = await prisma.creativeProject.findMany({
    where: { status: 'GENERATING' as never, ...(options.userId ? { userId: options.userId } : {}) },
  });
  const recovered: string[] = [];
  const alreadyActive: string[] = [];
  const stale: string[] = [];
  const model = runModel(prisma);

  for (const project of stuck) {
    const inFlight = await prisma.creativeProducedAsset.count({
      where: { projectId: project.id, status: { in: ['GENERATING' as never, 'QUEUED' as never] } },
    });
    const latestRun = model?.findFirst
      ? await model.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } }).catch(() => null)
      : null;
    const heartbeatFresh = Boolean(latestRun && latestRun.status === 'RUNNING' && now().getTime() - new Date(latestRun.heartbeatAt).getTime() < staleMs);
    if (inFlight > 0 && heartbeatFresh) {
      alreadyActive.push(project.id);
      continue;
    }
    if (latestRun && latestRun.status === 'RUNNING') {
      stale.push(project.id);
      if (model?.update) {
        await model.update({ where: { id: latestRun.id }, data: { attempt: { increment: 1 }, stage: 'recovering', lastError: 'Recovered after a process restart.' } }).catch(() => undefined);
      }
    }
    await runCreativeProduction(
      prisma,
      { projectId: project.id, runId: latestRun?.status === 'RUNNING' ? latestRun.id : undefined, attempt: latestRun ? 2 : 1 },
      deps,
      { now },
    );
    recovered.push(project.id);
  }
  return { recovered, alreadyActive, stale };
}
