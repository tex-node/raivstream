# Gate D — fal.ai Visual Quality Evaluation (Flux.2 / H3-Max Turbo / VEED Fabric)

**Date:** 2026-09-21
**Status:** TECHNICAL PASS — human aesthetic sign-off pending
**Purpose:** Roadmap Gate D: evaluate output quality of the three live-proven fal contracts before staging rollout and production canary (Gates E/F).
**Method:** Real generations through the exact production adapters (`generation.create` → fal queue → poll → R2 mirror) via `pnpm fal:quality` (`scripts/fal-quality-batch.ts`), staged bucket only (`FAL_USE_PRODUCTION_STORAGE=false`).

---

## 1. Batch Summary

| Metric | Result |
| --- | --- |
| Submissions | 9 (6× FLUX2, 2× H3_MAX, 1× VEED_FABRIC) |
| Completed | 9/9 (0 failed, 0 timeout) |
| Storage | All outputs mirrored to staging R2 (`pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/…`) |
| Rate limiting | No 403s observed (25s pause between submissions) |

## 2. Objective Technical Results

### FLUX2 (image)

| Key | Latency | Resolution | Aspect | Requested |
| --- | ---: | ---: | --- | --- |
| storybook-puppy | 11s | 576×1024 | 9:16 ✓ | 9:16 |
| anime-heroine | 11s | 576×1024 | 9:16 ✓ | 9:16 |
| cinematic-lighthouse | 17s | 1024×576 | 16:9 ✓ | 16:9 |
| photoreal-presenter | 28s | 576×1024 | 9:16 ✓ | 9:16 |
| folktale-baobab | 28s | 1024×1024 | 1:1 ✓ | 1:1 |
| 3d-robot-delivery | 22s | 576×1024 | 9:16 ✓ | 9:16 |

All PNG (valid signature), aspect ratio matches the request for every sample.

### H3_MAX (image-to-video)

| Key | Latency | Duration | Video | Audio | Resolution |
| --- | ---: | ---: | --- | --- | --- |
| h3max-puppy (from storybook-puppy) | 18s | 6.592s | h264 | aac | 768×1344 (9:16) |
| h3max-lighthouse (from cinematic-lighthouse) | 13s | 6.592s | h264 | aac | 1344×768 (16:9) |

Valid MP4 containers; duration ≈ requested 6s (+0.59s model tail); seed stills used as the opening frame.

### VEED_FABRIC (talking-video)

| Key | Latency | Duration | Video | Audio | Resolution |
| --- | ---: | ---: | --- | --- | --- |
| veed-talk (photoreal-presenter + staging veed-smoke audio) | 40s | 4.2s | h264 | aac | 736×1312 (9:16) |

Audio stream present in the output — the lip-sync track is embedded (not silent). This is the first VEED output with the fixed `resolution: 720p` contract.

## 3. Evaluation Rubric (human review)

Objective gates above are PASS. The following require visual judgment. Outputs are already downloaded to
`C:\Raiv\raivstream\tmp\fal-quality\downloads\` and available at the URLs below.

| Asset | Direct URL |
| --- | --- |
| storybook-puppy | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c172-db0d-7ef0-a2d5-ac408e079c5b.png |
| anime-heroine | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c173-6b4b-7ab3-aec0-79fe96736f1f.png |
| cinematic-lighthouse | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c173-fa1c-7e70-95f2-66293d4650a9.png |
| photoreal-presenter | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c174-9f01-7ce0-b878-7d3c6ab1bee2.png |
| folktale-baobab | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c175-6f1d-7050-9b4e-f16a68a6050a.png |
| 3d-robot-delivery | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/flux2/01a0c176-409b-74c1-9990-d42ecaacde13.png |
| h3max-puppy | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/h3max/01a0c176-f9e4-7292-bc1b-4319926b7219.mp4 |
| h3max-lighthouse | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/h3max/01a0c177-a438-77c2-bb83-e08e13a4e613.mp4 |
| veed-talk | https://pub-b95d45d0d8e548a2a985572f87a4c701.r2.dev/generated/fal/veed/01a0c178-3bf3-7012-b3a2-ca84f8fd6606.mp4 |

### Score 1–5 (5 = excellent) per asset

**FLUX2:** prompt adherence · composition · artifacts (text, hands, anatomy) · style match · storybook/AI-Studio suitability
**H3_MAX:** seed-image character consistency · motion naturalness · smoothness · duration usefulness
**VEED:** lip-sync accuracy · presenter fidelity vs source still · audio intelligibility · resolution

## 4. Findings

- **Reliability:** 9/9 success, no retries, no refunds, no storage failures. Latency consistent with contract validation (11–28s image, 13–18s video, ~40s talking-video).
- **Aspect compliance:** perfect (9:16 / 16:9 / 1:1 all correct).
- **Resolution:** FLUX2 at ~0.6 MP (576×1024) is fine for feed/story assets; H3_MAX upscales to 768×1344 / 1344×768. VEED 736×1312 with 720p contract.
- **Audio:** H3_MAX outputs carry an aac track (product decision needed: keep provider audio or strip when a film's narration/music tracks are mixed separately — see Phase 10 movie renderer which already strips clip audio). VEED embeds the lip-sync track correctly.
- **Known product gaps (not Gate-D blockers):** VEED still lacks audio-input UI + UGC consent/ownership/moderation; FLUX2 is already wired into AI Studio + Story scene-image; H3_MAX into Story scene-video.

## 5. Recommendation

**TECHNICAL GATE: PASS.** All objective checks are green and the three contracts are production-ready from a reliability/format standpoint.

**Enablement still requires (in order):**
1. **Human visual sign-off** on the 9 outputs above (aesthetic rubric, Section 3) — required because automated review cannot judge prompt fidelity/artifacts.
2. **Cost approval** — confirm real fal spend per generation is acceptable vs the active credit rates (80/200/300). Exact per-request cost is on the fal.ai billing dashboard; the current rates were placeholder estimates.
3. **Staging rollout (Gate C-once-more)** — run the staged flow on the isolated staging deployment with production-like env, then **prod canary (Gate E)** before broad enablement.

**Do NOT flip production `FAL_*` switches until the visual sign-off above is recorded.**

## 6. Artifacts

- Batch script: `scripts/fal-quality-batch.ts` (`pnpm fal:quality`)
- Manifest: `tmp/fal-quality/manifest.json` (gitignored)
- Downloads: `tmp/fal-quality/downloads/` (gitignored)