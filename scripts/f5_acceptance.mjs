#!/usr/bin/env node
/**
 * F5 Acceptance — "Let's talk about ships" real end-to-end
 *
 * Exercises the full R16 educational pipeline against the live VPS:
 *   createSpark → generateStory → generateScenes →
 *   (per scene) generateSceneImage → generateSceneVideo → generateEducationalNarration →
 *   requestStoryVideoExport → ffprobe binary validation
 *
 * Run from the VPS:
 *   SESSION_TOKEN=<jwt> node /root/raivstream/scripts/f5_acceptance.mjs
 *
 * The SESSION_TOKEN is a valid JWT for a real R16-enabled user account.
 * It is read from the environment — never passed on the command line.
 *
 * Exit 0 = all checks passed.
 * Exit 1 = at least one check failed.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://r16.raivstream.com';
const TRPC_BASE  = `${BASE_URL}/api/trpc`;
const IDEA       = "Let's talk about ships";
const STORY_TYPE = 'EDUCATIONAL';
const AUDIENCE   = 'KIDS';

const POLL_INTERVAL_MS  = 10_000;  // 10s between polls
const POLL_TIMEOUT_MS   = 600_000; // 10 min per asset

// ─── Auth ─────────────────────────────────────────────────────────────────────

const SESSION_TOKEN = process.env.SESSION_TOKEN;
if (!SESSION_TOKEN) {
  console.error('ERROR: SESSION_TOKEN env var is required.');
  console.error('  SESSION_TOKEN=<jwt> node f5_acceptance.mjs');
  process.exit(1);
}

const HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SESSION_TOKEN}`,
  'x-r16-mode':   '1',
  'Origin':        BASE_URL,
};

// ─── tRPC helpers ─────────────────────────────────────────────────────────────

async function mutation(procedure, input) {
  const url = `${TRPC_BASE}/${procedure}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify({ json: input }),
  });
  const raw = await res.json();
  if (!res.ok || raw.error) {
    const msg = raw.error?.message ?? raw.error?.json?.message ?? JSON.stringify(raw);
    throw new Error(`[${procedure}] HTTP ${res.status}: ${msg}`);
  }
  // tRPC v10 wraps result in { result: { data: { json: ... } } }
  return raw.result?.data?.json ?? raw.result?.data ?? raw;
}

async function query(procedure, input) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const url     = `${TRPC_BASE}/${procedure}?input=${encoded}`;
  const res = await fetch(url, { method: 'GET', headers: HEADERS });
  const raw = await res.json();
  if (!res.ok || raw.error) {
    const msg = raw.error?.message ?? raw.error?.json?.message ?? JSON.stringify(raw);
    throw new Error(`[${procedure}] HTTP ${res.status}: ${msg}`);
  }
  return raw.result?.data?.json ?? raw.result?.data ?? raw;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

async function pollSceneAsset(projectId, assetId, label) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  process.stdout.write(`  Polling ${label}`);
  while (Date.now() < deadline) {
    const asset = await query('story.getSceneAsset', { projectId, assetId });
    if (asset.status === 'READY')   { process.stdout.write(' → READY\n'); return asset; }
    if (asset.status === 'FAILED')  { process.stdout.write(' → FAILED\n'); throw new Error(`Asset ${assetId} failed: ${asset.errorMessage ?? 'unknown'}`); }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${label} (assetId=${assetId})`);
}

async function pollExport(projectId, exportId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  process.stdout.write('  Polling export');
  while (Date.now() < deadline) {
    const exp = await query('story.getStoryVideoExport', { projectId, exportId });
    if (exp?.status === 'READY')  { process.stdout.write(' → READY\n'); return exp; }
    if (exp?.status === 'FAILED') { process.stdout.write(' → FAILED\n'); throw new Error(`Export failed: ${exp.errorMessage ?? 'unknown'}`); }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for export');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Evidence record ──────────────────────────────────────────────────────────

const evidence = {
  timestamp:    new Date().toISOString(),
  idea:         IDEA,
  projectId:    null,
  contentType:  null,
  sceneCount:   0,
  scenes:       [],
  exportId:     null,
  exportStatus: null,
  exportUrl:    null,
  ffprobe:      null,
  checks:       [],
};

function pass(label) { evidence.checks.push({ label, result: 'PASS' }); console.log(`  ✓ ${label}`); }
function fail(label, reason) { evidence.checks.push({ label, result: 'FAIL', reason }); console.error(`  ✗ ${label}: ${reason}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  let exitCode = 0;

  try {
    // ── F5.1: Health gate ──────────────────────────────────────────────────────
    console.log('\n── F5.1: Health gate');
    const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
    if (health.status === 'healthy') {
      pass('API health: healthy');
    } else {
      fail('API health', JSON.stringify(health));
    }

    // ── F5.2: Create educational project ──────────────────────────────────────
    console.log('\n── F5.2: Create educational project');
    const project = await mutation('story.createSpark', {
      idea:         IDEA,
      storyType:    STORY_TYPE,
      audienceMode: AUDIENCE,
    });
    evidence.projectId = project.id;
    console.log(`  projectId: ${project.id}`);
    if (project.contentType === 'EDUCATIONAL') {
      pass('contentType persisted as EDUCATIONAL on createSpark');
    } else {
      // contentType may not be set until generateStory — acceptable
      console.log(`  note: contentType=${project.contentType ?? 'null'} (will be set by generateStory)`);
    }

    // ── F5.3: Generate story (classify → planEducation → lessonBody) ───────────
    console.log('\n── F5.3: Generate story');
    const chapter = await mutation('story.generateStory', { projectId: project.id });
    console.log(`  chapterId: ${chapter?.id ?? '(embedded in project)'}`);

    // Fetch project to verify contentType and educational contract
    const fullProject = await query('story.getProject', { projectId: project.id });
    evidence.contentType = fullProject.contentType;
    if (fullProject.contentType === 'EDUCATIONAL') {
      pass('contentType = EDUCATIONAL after generateStory');
    } else {
      fail('contentType after generateStory', `got ${fullProject.contentType}`);
    }
    const hasContract = fullProject.chapters?.[0]?.educationalContract != null;
    if (hasContract) {
      pass('educationalContract populated on chapter');
    } else {
      fail('educationalContract', 'null on chapter[0]');
    }

    // ── F5.4: Generate scenes ──────────────────────────────────────────────────
    console.log('\n── F5.4: Generate scenes');
    const scenes = await mutation('story.generateScenes', { projectId: project.id, replaceExisting: true });
    evidence.sceneCount = scenes.length;
    console.log(`  ${scenes.length} scene(s) generated`);
    if (scenes.length >= 3) {
      pass(`scene count ≥ 3 (got ${scenes.length})`);
    } else {
      fail('scene count', `expected ≥ 3, got ${scenes.length}`);
    }

    const allHaveNarrationText = scenes.every((s) => {
      const dm = s.directorMetadata;
      return dm && typeof dm === 'object' && typeof dm.narrationText === 'string' && dm.narrationText.length >= 10;
    });
    if (allHaveNarrationText) {
      pass('all scenes have narrationText in directorMetadata');
    } else {
      fail('narrationText', 'one or more scenes missing narrationText');
    }

    // ── F5.5 + F5.6 + F5.7: Per-scene image → video → narration ──────────────
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`\n── Scene ${i + 1}/${scenes.length}: ${scene.title ?? scene.id}`);
      const sceneEntry = { sceneId: scene.id, title: scene.title, imageAssetId: null, videoAssetId: null, narrationAudioUrl: null };

      // Image generation
      // generateSceneImage is synchronous — waits for FAL inline, returns { scene, asset, criticRun }.
      // The asset is already READY (or FAILED) when the mutation returns; no polling needed.
      console.log('  Generating scene image...');
      const imgResult = await mutation('story.generateSceneImage', {
        projectId: project.id,
        sceneId:   scene.id,
        model:     'FLUX2',
      });
      const imgAsset = imgResult.asset;
      sceneEntry.imageAssetId = imgAsset.id;
      if (imgAsset.status === 'READY' && imgAsset.assetUrl) {
        pass(`scene ${i + 1}: image READY`);
      } else {
        fail(`scene ${i + 1}: image`, `status=${imgAsset.status} errorMessage=${imgAsset.errorMessage ?? 'none'}`);
      }

      // Video generation (image-to-video via H3_MAX)
      // generateSceneVideo is also synchronous — returns { scene, asset }.
      console.log('  Generating scene video (H3_MAX image-to-video)...');
      const vidResult = await mutation('story.generateSceneVideo', {
        projectId: project.id,
        sceneId:   scene.id,
        model:     'H3_MAX',
      });
      const vidAsset = vidResult.asset;
      sceneEntry.videoAssetId = vidAsset.id;
      if (vidAsset.status === 'READY' && vidAsset.assetUrl) {
        pass(`scene ${i + 1}: video READY`);
      } else {
        fail(`scene ${i + 1}: video`, `status=${vidAsset.status} errorMessage=${vidAsset.errorMessage ?? 'none'}`);
      }

      // Educational narration (ElevenLabs)
      console.log('  Generating educational narration (ElevenLabs)...');
      const narration = await mutation('story.generateEducationalNarration', {
        projectId: project.id,
        sceneId:   scene.id,
      });
      sceneEntry.narrationAudioUrl = narration.audioUrl;
      if (narration.audioUrl && narration.audioUrl.startsWith('http')) {
        pass(`scene ${i + 1}: narration audio generated`);
      } else {
        fail(`scene ${i + 1}: narration`, `audioUrl=${narration.audioUrl}`);
      }

      evidence.scenes.push(sceneEntry);
    }

    // ── F5.8: Export story video ───────────────────────────────────────────────
    console.log('\n── F5.8: Export story video (FFmpeg audio mux)');
    console.log('  Requesting export (synchronous — may take 1–3 minutes)...');
    const exportResult = await mutation('story.requestStoryVideoExport', { projectId: project.id });
    evidence.exportId     = exportResult.id;
    evidence.exportStatus = exportResult.status;
    evidence.exportUrl    = exportResult.assetUrl;

    if (exportResult.status === 'READY' && exportResult.assetUrl) {
      pass('story export status = READY');
      pass(`export assetUrl present: ${exportResult.assetUrl.slice(0, 60)}...`);
    } else if (exportResult.status === 'GENERATING') {
      // Synchronous path can occasionally return GENERATING if the export was
      // just created. Poll once more.
      const polled = await pollExport(project.id, exportResult.id);
      evidence.exportStatus = polled.status;
      evidence.exportUrl    = polled.assetUrl;
      if (polled.status === 'READY' && polled.assetUrl) {
        pass('story export polled → READY');
        pass(`export assetUrl present: ${polled.assetUrl.slice(0, 60)}...`);
      } else {
        fail('story export', `status=${polled.status}`);
      }
    } else {
      fail('story export', `status=${exportResult.status}, error=${exportResult.errorMessage}`);
    }

    // ── F5.9: Idempotency check ────────────────────────────────────────────────
    console.log('\n── F5.9: Idempotency check');
    const exportAgain = await mutation('story.requestStoryVideoExport', { projectId: project.id });
    if (exportAgain.id === evidence.exportId) {
      pass('idempotency: second export call returns same row');
    } else {
      fail('idempotency', `first=${evidence.exportId} second=${exportAgain.id}`);
    }

    // ── F5.10: Download MP4 + ffprobe validation ───────────────────────────────
    console.log('\n── F5.10: Download MP4 and run ffprobe');
    const mp4Url = evidence.exportUrl;
    if (!mp4Url) {
      fail('ffprobe', 'no export URL — cannot download MP4');
    } else {
      // Download the MP4 to a temp file
      const tmpMp4 = join(tmpdir(), `f5_raivstream_${Date.now()}.mp4`);
      console.log(`  Downloading MP4 from ${mp4Url.slice(0, 80)}...`);
      const dlRes = await fetch(mp4Url);
      if (!dlRes.ok) {
        fail('MP4 download', `HTTP ${dlRes.status}`);
      } else {
        const buf = Buffer.from(await dlRes.arrayBuffer());
        writeFileSync(tmpMp4, buf);
        console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB → ${tmpMp4}`);
        pass(`MP4 downloaded: ${(buf.length / 1024).toFixed(0)} KB`);

        try {
          const probeJson = execSync(
            `ffprobe -v error -show_entries stream=index,codec_type,codec_name,duration -of json "${tmpMp4}"`,
            { encoding: 'utf8' },
          );
          const probe = JSON.parse(probeJson);
          evidence.ffprobe = probe;

          const streams    = probe.streams ?? [];
          const videoStreams = streams.filter((s) => s.codec_type === 'video');
          const audioStreams = streams.filter((s) => s.codec_type === 'audio');

          console.log('\n  ffprobe streams:');
          for (const s of streams) {
            console.log(`    [${s.index}] ${s.codec_type}: ${s.codec_name}, duration=${s.duration}`);
          }

          if (videoStreams.length >= 1) {
            pass(`video stream present (codec=${videoStreams[0].codec_name})`);
          } else {
            fail('video stream', 'no video stream in MP4');
          }

          if (audioStreams.length >= 1) {
            pass(`audio stream present (codec=${audioStreams[0].codec_name})`);
          } else {
            fail('audio stream', 'no audio stream in MP4 — mux failed');
          }

          const videoDuration = parseFloat(videoStreams[0]?.duration ?? '0');
          const audioDuration = parseFloat(audioStreams[0]?.duration ?? '0');

          if (videoDuration > 0) {
            pass(`video duration > 0 (${videoDuration.toFixed(2)}s)`);
          } else {
            fail('video duration', `${videoDuration}`);
          }

          if (audioDuration > 0) {
            pass(`audio duration > 0 (${audioDuration.toFixed(2)}s)`);
          } else {
            fail('audio duration', `${audioDuration}`);
          }

        } catch (ffErr) {
          fail('ffprobe', ffErr.message);
        } finally {
          try { unlinkSync(tmpMp4); } catch {}
        }
      }
    }

    // ── F5.11: R16 safety regression — non-R16 cannot access r16Procedure ─────
    console.log('\n── F5.11: R16 safety regression');
    // Without x-r16-mode, the r16Procedure should return FORBIDDEN
    const noR16Headers = { ...HEADERS };
    delete noR16Headers['x-r16-mode'];
    // Override the origin too so the host header check doesn't save us
    noR16Headers['host'] = 'app.raivstream.com';
    const noR16Res = await fetch(
      `https://app.raivstream.com/api/trpc/story.requestStoryVideoExport`,
      {
        method:  'POST',
        headers: { ...noR16Headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ json: { projectId: evidence.projectId } }),
      },
    );
    const noR16Body = await noR16Res.json();
    const errorCode = noR16Body?.error?.data?.code ?? noR16Body?.error?.json?.data?.code ?? null;
    if (['FORBIDDEN', 'UNAUTHORIZED'].includes(errorCode)) {
      pass(`R16 guard: non-R16 request rejected (${errorCode})`);
    } else {
      fail('R16 guard', `expected FORBIDDEN/UNAUTHORIZED, got code=${errorCode} status=${noR16Res.status}`);
    }

  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    evidence.fatalError = err.message;
    exitCode = 1;
  }

  // ── Final report ──────────────────────────────────────────────────────────
  const passed = evidence.checks.filter((c) => c.result === 'PASS').length;
  const failed = evidence.checks.filter((c) => c.result === 'FAIL').length;

  console.log('\n══════════════════════════════════════════════════');
  console.log('F5 ACCEPTANCE REPORT');
  console.log('══════════════════════════════════════════════════');
  console.log(`Timestamp : ${evidence.timestamp}`);
  console.log(`Idea      : ${evidence.idea}`);
  console.log(`ProjectID : ${evidence.projectId ?? 'N/A'}`);
  console.log(`ContentType: ${evidence.contentType ?? 'N/A'}`);
  console.log(`Scenes    : ${evidence.sceneCount}`);
  console.log(`ExportID  : ${evidence.exportId ?? 'N/A'}`);
  console.log(`ExportURL : ${evidence.exportUrl ? evidence.exportUrl.slice(0, 80) + '...' : 'N/A'}`);
  console.log('');
  if (evidence.ffprobe) {
    const streams = evidence.ffprobe.streams ?? [];
    for (const s of streams) {
      console.log(`Stream[${s.index}]: ${s.codec_type} / ${s.codec_name} / duration=${s.duration}s`);
    }
  }
  console.log('');
  console.log(`Checks    : ${passed} passed, ${failed} failed`);
  console.log('');
  for (const c of evidence.checks) {
    const icon = c.result === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${c.label}${c.reason ? ` — ${c.reason}` : ''}`);
  }
  console.log('══════════════════════════════════════════════════');

  if (failed > 0 || exitCode !== 0) {
    console.log('\nSTATUS: FAIL');
    process.exit(1);
  } else {
    console.log('\nSTATUS: PASS — educational pipeline end-to-end validated');
    process.exit(0);
  }
})();
