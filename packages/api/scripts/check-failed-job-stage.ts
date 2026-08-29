/**
 * Diagnostic-only. Reads a MovieRenderJob and reports the exact
 * authoritative failure picture from persisted data alone. Never modifies
 * renderer, worker, R2-helper, or snapshot code/behavior, and never writes
 * to the DB — read-only, safe to run against any job id.
 *
 * Stage classification (section 4) is derived ONLY from the job's own
 * persisted MovieRenderEvent stage history plus its errorCode/errorMessage
 * — never inferred from URL shape or asset-record contents.
 *
 * Stage → code-path map (traced directly from movieRenderWorker.ts):
 *   A. visual image resolution/download  — inside stage `rendering_shot_N`
 *      (downloadToFile(shot.sourceUrl, ...) — shot.sourceUrl comes from
 *      StorySceneAsset.assetUrl/thumbnailUrl, NOT getPublicUrlForKey/
 *      R2_PUBLIC_URL — a completely different resolver than audio, see
 *      movieRenderPlanning.ts:158)
 *   B. visual FFmpeg assembly            — stage `assembling`
 *   C. audio asset validation            — stage `mixing_audio`,
 *      errorCode in {AUDIO_ASSET_NOT_FOUND, AUDIO_ASSET_PROJECT_MISMATCH,
 *      AUDIO_ASSET_STORAGE_KEY_MISSING, AUDIO_ASSET_STORAGE_KEY_MISMATCH}
 *   D. audio download                    — stage `mixing_audio`,
 *      errorMessage starts with "Failed to download render source"
 *   E. audio probe/normalize             — stage `mixing_audio`,
 *      errorCode === AUDIO_ASSET_PROBE_FAILED
 *   F/G. mix / mux                       — stage `mixing_audio`, a generic
 *      (non-typed-code) ffmpeg failure — the two aren't distinguishable
 *      from persisted data alone (no separate stage event exists between
 *      buildMixedAudioTrack and muxAudioWithVideo); reported as an
 *      ambiguous F/G candidate, not guessed.
 *   H. final FFprobe READY gate          — stage `verifying_output` (silent
 *      pre-mix duration check), OR stage `mixing_audio` with errorCode in
 *      {OUTPUT_DURATION_MISMATCH, OUTPUT_AUDIO_STREAM_MISSING,
 *      OUTPUT_AUDIO_VERIFICATION_FAILED} (post-mux gate)
 *   I. R2 upload                         — stage `uploading_to_r2`
 *
 * Usage: pnpm exec tsx scripts/check-failed-job-stage.ts <jobId>
 */
import { PrismaClient } from '@raivstream/database';

const AUDIO_VALIDATION_CODES = ['AUDIO_ASSET_NOT_FOUND', 'AUDIO_ASSET_PROJECT_MISMATCH', 'AUDIO_ASSET_STORAGE_KEY_MISSING', 'AUDIO_ASSET_STORAGE_KEY_MISMATCH'];
const OUTPUT_GATE_CODES = ['OUTPUT_DURATION_MISMATCH', 'OUTPUT_AUDIO_STREAM_MISSING', 'OUTPUT_AUDIO_VERIFICATION_FAILED'];

function sanitize(message: string | null): string | null {
  if (!message) return message;
  // Strip query strings (potential signed-URL tokens) and collapse any
  // embedded URL down to origin+path — evidence about *which* resource,
  // never credentials/tokens.
  return message.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, '$1').replace(/\s+/g, ' ').trim();
}

function classifyStage(job: any, events: any[]): { bucket: string; label: string; basis: string } {
  if (job.status === 'READY') return { bucket: 'none', label: 'No failure — job reached READY', basis: `final event stage=${events[events.length - 1]?.stage}` };

  // job.currentStage is NOT reliable here: failJob() overwrites it to
  // 'failed' on the way out, so by the time this script reads the row the
  // original in-progress stage is gone from that field. The event history
  // still has it — the last progress event before the terminal
  // movie_render_failed/'failed' event is the stage that was actually
  // executing when the error was thrown.
  const lastProgressEvent = [...events].reverse().find((e) => e.stage && e.stage !== 'failed' && e.stage !== 'cancelled');
  const failedStage = lastProgressEvent?.stage ?? job.currentStage;
  const code = job.errorCode as string | null;
  const message = (job.errorMessage as string | null) ?? '';

  if (failedStage?.startsWith('rendering_shot_')) {
    return { bucket: 'A', label: 'visual image resolution/download (or per-shot ffmpeg encode)', basis: `currentStage=${failedStage}, errorCode=${code}` };
  }
  if (failedStage === 'assembling') {
    return { bucket: 'B', label: 'visual FFmpeg assembly (multi-shot concat)', basis: `currentStage=${failedStage}, errorCode=${code}` };
  }
  if (failedStage === 'verifying_output') {
    return { bucket: 'H', label: 'final FFprobe READY gate (pre-mix, silent-output duration check)', basis: `currentStage=${failedStage}, errorCode=${code}` };
  }
  if (failedStage === 'mixing_audio') {
    if (code && AUDIO_VALIDATION_CODES.includes(code)) {
      return { bucket: 'C', label: 'audio asset validation (existence/ownership/storage-key/provenance)', basis: `currentStage=${failedStage}, errorCode=${code}` };
    }
    if (message.startsWith('Failed to download render source')) {
      return { bucket: 'D', label: 'audio download', basis: `currentStage=${failedStage}, errorMessage starts with "Failed to download render source"` };
    }
    if (code === 'AUDIO_ASSET_PROBE_FAILED') {
      return { bucket: 'E', label: 'audio probe/normalize', basis: `currentStage=${failedStage}, errorCode=${code}` };
    }
    if (code && OUTPUT_GATE_CODES.includes(code)) {
      return { bucket: 'H', label: 'final FFprobe READY gate (post-mux)', basis: `currentStage=${failedStage}, errorCode=${code}` };
    }
    return { bucket: 'F/G (ambiguous)', label: 'mix or mux — not distinguishable from persisted data alone (no separate stage event between them)', basis: `currentStage=${failedStage}, errorCode=${code ?? '(none — generic command failure)'}` };
  }
  if (failedStage === 'uploading_to_r2') {
    return { bucket: 'I', label: 'R2 upload (final output)', basis: `currentStage=${failedStage}, errorCode=${code}` };
  }
  return { bucket: 'unknown', label: `unrecognized stage "${failedStage}" — extend this script's mapping`, basis: `currentStage=${failedStage}` };
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) throw new Error('Usage: check-failed-job-stage.ts <jobId>');
  const prisma = new PrismaClient();
  try {
    const job = await prisma.movieRenderJob.findUnique({
      where: { id: jobId },
      include: { movieAsset: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!job) {
      console.log(JSON.stringify({ ok: false, error: `No MovieRenderJob found with id ${jobId}` }, null, 2));
      return;
    }
    const events = (job as any).events as any[];
    const movieAsset = (job as any).movieAsset as any;
    const renderPlan = job.renderPlan as any;
    const filmBlueprint = job.filmBlueprintSnapshot as any;
    const audioBlueprint = job.audioBlueprintSnapshot as any;

    const actualDuration =
      movieAsset?.metadata?.verification?.actualDurationSeconds ??
      // Fall back to parsing an OUTPUT_DURATION_MISMATCH message when no
      // MovieAsset exists (render failed before creating one).
      (job.errorMessage?.match(/actual ([\d.]+)s/)?.[1] ? Number(job.errorMessage.match(/actual ([\d.]+)s/)![1]) : null);

    const report = {
      section1_movieRenderJob: {
        id: job.id,
        status: job.status,
        errorCode: job.errorCode,
        errorMessage: sanitize(job.errorMessage),
        rendererVersion: job.rendererVersion,
        expectedDurationSeconds: renderPlan?.runtimeSeconds ?? null,
        actualOrProbedDurationSeconds: actualDuration,
      },
      section2_movieAsset: movieAsset
        ? {
            exists: true,
            storageKey: movieAsset.storageKey,
            status: movieAsset.status,
            isCurrent: movieAsset.isCurrent,
            hasAudio: movieAsset.metadata?.hasAudio ?? null,
            verificationPresent: Boolean(movieAsset.metadata?.verification),
            audioVerificationPresent: Boolean(movieAsset.metadata?.audioVerification),
          }
        : { exists: false },
      section3_snapshot: {
        filmBlueprint_sceneShotAssetIds: (renderPlan?.shots ?? []).map((s: any) => ({ shotId: s.shotId ?? s.id ?? null, assetId: s.assetId ?? null })),
        filmBlueprint_runtimeSeconds: filmBlueprint?.runtimeSeconds ?? renderPlan?.runtimeSeconds ?? null,
        audioBlueprint_cues: (audioBlueprint?.tracks ?? []).flatMap((t: any) =>
          (t.cues ?? []).map((c: any) => ({ cueId: c.cueId, audioAssetId: c.audioAssetId, storageKey: c.storageKey })),
        ),
        audioBlueprintHash_stored: job.audioBlueprintHash,
        renderPlanHash: job.renderPlanHash,
      },
      section4_stageClassification: classifyStage(job, events),
      section5_eventHistory: events.map((e) => ({ createdAt: e.createdAt, eventName: e.eventName, stage: e.stage, progressPercent: e.progressPercent, message: sanitize(e.message) })),
      note: 'Classification in section 4 is derived only from persisted stage + errorCode/errorMessage prefixes — never inferred from URL shape or asset-record contents. This script performs no writes and changes no renderer/worker/R2/snapshot behavior.',
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
