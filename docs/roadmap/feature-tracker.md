# Raivstream Feature Tracker

Single source of truth for feature status. Update on every status change and link from `SESSION.md`.

> **Decisions & plans:** [`docs/decisions/DECISIONS.md`](../decisions/DECISIONS.md).

Seeded 2026-10-15 from `SESSION.md` (latest entries 2026-10-12 / 2026-10-13). Verify each row against the repo, CI and the VPS before relying on it.

## Status ladder

Use these exact words. Never collapse them.

`PROPOSED â†’ DESIGNED â†’ IMPLEMENTED â†’ TESTED â†’ CI-GREEN â†’ STAGING-QUALIFIED â†’ DEPLOYED â†’ ACCEPTED`

| Status | Means |
|---|---|
| PROPOSED | Idea or concept doc only |
| DESIGNED | Architecture doc / ADR reviewed |
| IMPLEMENTED | Code exists locally or on a branch |
| TESTED | Unit + integration tests green locally |
| CI-GREEN | Hosted CI green on the PR |
| STAGING-QUALIFIED | Real DB / real media / real provider evidence on staging |
| DEPLOYED | Running in production (verified VPS HEAD) |
| ACCEPTED | Human acceptance recorded |

## Release context

- Production HEAD: **`main`** â€” always verify with `git -C /root/raivstream rev-parse HEAD`; do not trust a SHA written here (last recorded at time of writing: `8969f6e`, 2026-10-18).
- The bullets below are **historical (2026-10-15)** and describe the upgrade branch at that time. They are not current release state:
  - Upgrade branch: `feat/raivstream-upgrade` â†’ Draft PR #4, HEAD `c8f4adb`, 34 commits on `a9cb10f`
  - CI on PR #4: `test-unit` PASS; `test-integration` 14/14 but job red on stale count assertion (4 â†’ 14) in `.github/workflows/{ci,deploy}.yml`
- Migrations: 9 upgrade migrations in **mixed** state after the 2026-10-13 incident (`â€¦140000_not_null` applied then rolled back). Reconcile against `_prisma_migrations` before any apply. See `docs/operations/migration-runbook.md`.

## Features

| ID | Feature | Track | Branch | Key commits | Migrations | Status | Evidence | Blocking gate | Next action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|
| P1-CREDITS | Credit ledger idempotency | Engineering | feat/raivstream-upgrade | ede6c45, c8f4adb | upgrade Â§4 (incl. `20261012130000` backfill, `20261012140000` not_null) | TESTED | upgrade-plan-closing-status.md | CI count fix; mixed migration state | Reconcile prod migrations; fix CI 4â†’14 | â€” |
| PL-01 | Admin usage reporting | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | upgrade-plan-closing-status.md | PR #4 CI + staging | Staging verification | â€” |
| MUSIC-PERCUE | Music charge per-cue fix | Engineering | feat/raivstream-upgrade | c8f4adb | â€” | TESTED | SESSION.md 2026-10-12 | CI count assertion | Fix ci/deploy.yml count | â€” |
| R16-02 | R16 visual styles (Cartoon/Anime/3D) | Product | feat/raivstream-upgrade | 682202c | â€” | TESTED | phase-2-release-evidence.md | Legacy-project E2E | Staging E2E incl. legacy projects | â€” |
| R16-03 | Character reference approval + continuity | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | phase-2-release-evidence.md | Staging evidence | Multi-scene acceptance run | â€” |
| R16-04 | Batch scene generation | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | phase-2-release-evidence.md | Staging evidence | Partial-failure + credit reconciliation on staging | â€” |
| R16-05 | Chapter version history | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | phase-2-release-evidence.md | Staging evidence | Snapshot/restore on staging | â€” |
| P3-ENDCARD | Two-second end card | Product | main | c85dd48 | `20261009110000` (endCardApplied col) | ACCEPTED | export cmv9ysnu40001n8xkzhwktjw6: 32.000s video=audio, endCardApplied=true, frame "Created on Raivstream / @fothlog" | â€” | â€” | â€” |
| P4A-PUBLISH | R16 publication lifecycle | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | phase-4-release-evidence.md | Privacy/permission tests on staging | Staging verification | â€” |
| P4B-SHARE | Share links + per-click attribution (90-day, no IP) | Product | feat/raivstream-upgrade | â€” | upgrade Â§4 | TESTED | phase-4-release-evidence.md | Staging verification | Staging verification | â€” |
| R16-EXPORT | R16 story video export (2Aâ€“2D) | Product | (confirm branch) | â€” | `20260925180000_story_video_export` | TESTED | SESSION.md 2026-09-25/26 | Migration + VPS acceptance (2H/2I) | Phase 2H real acceptance | â€” |
| EDU-B | Educational intent/content contract | Product | (confirm branch) | â€” | `20260926120000_educational_contract` | TESTED | SESSION.md 2026-09-26 | Migration deploy | Deploy migration | â€” |
| EDU-C-G | Educational narration, visuals, QA, prod test | Product | â€” | â€” | â€” | PROPOSED | â€” | EDU-B deployed | Design Phase C | â€” |
| R16-STYLE-LOCK | R16 generation-time style enforcement (KIDS â†’ CARTOON) | Engineering | main | 5556178 | â€” | DEPLOYED | PR #42 | â€” | â€” | â€” |
| STORY-PACE | Story length/pacing choice (Short/Medium/Long, write-to-budget, beats=scenes) | Product | feat/story-pace | â€” | `20261015130000_story_length` | IMPLEMENTED | â€” | Staging run + 8-idea baseline | Phase B code done; staging run + one real Short R16 story | â€” |
| MEDIA-LIB | Unified user media library (view, download, soft-delete, post to feed; R16 first) | Product | â€” | â€” | TBD | PROPOSED | docs/product/next-features.md | STORY-PACE Phase A | Phase A: inventory + design | â€” |
| ADMIN-INSIGHTS | Per-user admin view (credit spend, purchases, media, engagement; CSV) | Product | â€” | â€” | TBD | PROPOSED | docs/product/next-features.md | â€” | Phase A: data inventory + design | â€” |
| R16-AUDIO | R16 narration + music + FFmpeg mux | Product | main (unpushed?) | c188f76, 4330faa, 9d8ca17 | `20261009120000`, `20261009130000` | TESTED | r16-video-audio-phase-abc-verification.md | Staging S1â€“S11; speech rate seed | Staging acceptance | â€” |
| REF-UPLOAD | Creative reference upload (`attachments[].url`) | Product | â€” | â€” | TBD | PROPOSED | SESSION.md 2026-09-23 (gap C) | â€” | Design binary upload â†’ R2 | â€” |
| SEQ-9A | Sequence Workspace / timeline | Product | main | f5529bb | `20260823090000` | DEPLOYED | phase-9a-staging-qualification.md | â€” | Human acceptance | â€” |
| MOVIE-9B1 | Movie Builder deterministic render | Product | main | â€” | `20260823170000` | DEPLOYED | phase-9b1-staging-qualification.md | â€” | Human acceptance | â€” |
| AUDIO-9B2 | Audio & Performance layer | Product | (confirm) | â€” | `20260827120000`, `20260827180000` | STAGING-QUALIFIED | phase-9b2-staging-qualification.md | Production release | Confirm prod status; plan release | â€” |
| CREATIVE-5 | Raivstream 5.0 semantic studio | Product | main | 8b1049a | several | DEPLOYED | phase-9-final-launch-acceptance.md | Human UX acceptance | Run UX sessions | â€” |
| WB-7A | World Builder | Product | feat/world-builder | â€” | TBD | PROPOSED | Story Playground Concept | Release gates first | Architecture doc + ADR | â€” |
| TL-7B | Timeline editor integration | Product | â€” | â€” | â€” | PROPOSED | â€” | Reconcile with SEQ-9A | Gap analysis vs SEQ-9A | â€” |
| MOVIE-7C | Movie Builder from timeline | Product | â€” | â€” | â€” | PROPOSED | â€” | TL-7B | Design | â€” |
| TRANS-7D | Scene transition generator | Product | â€” | â€” | â€” | PROPOSED | â€” | MOVIE-7C | Design | â€” |
| P8-UNIVERSE | Voice, music, shared universes | Product | â€” | â€” | â€” | PROPOSED | â€” | AUDIO + WB-7A | Reconcile existing audio work | â€” |
| SEC-RATELIMIT | API rate limiting (Â§1.4, Redis-backed, 11 buckets) | Engineering | main | 37a249b, 284218d, f317edc | â€” | DEPLOYED | PRs #68 / #69 (exec-shape fix) / #70 (logging); prod: 6 logins â†’ 5Ã—401 then 429 + Retry-After; health 100/100 | â€” | â€” | â€” |
| SEC-RATELIMIT-2 | D-067 Phase 2 â€” read fail-open / write fail-closed under Redis outage | Engineering | â€” | â€” | â€” | PROPOSED | DECISIONS D-067 | Redis outage mitigation | Design the safety-class split | â€” |
| SEC-CACHE | Redis-backed read cache (Â§1.5) â€” credit rates + feeds | Engineering | main | 94cdbda | â€” | DEPLOYED | PR #75; 42 trending requests â†’ +1 `videos` seq_scan; cold 0.24 s / warm 0.05 s. Context user permanently excluded (D-069) | â€” | â€” | â€” |
| SEC-CACHE-2 | D-070 â€” cache `story.getWorkspace` (per-user, 3â€“5 joins) | Engineering | â€” | â€” | â€” | PROPOSED | DECISIONS D-070 | Key + invalidation design | Design per-user keys | â€” |
| SEC-CACHE-3 | D-072 â€” await `recomputeEngagementScore` (enables interaction invalidation) | Engineering | â€” | â€” | â€” | PROPOSED | DECISIONS D-072 | Fire-and-forget recompute | Make awaited before return | â€” |
| EXPORT-WORKER | D-033 — async story export via pg-boss worker | Engineering | main | eba6d67f, 607d4c78, 5aa8a8a8 | — | DEPLOYED & VERIFIED | Real user export cmvf0a2qg00dv2p5zl7sym3p3: returned PENDING, queue pickup **0.81 s** (pgboss created_on→started_on), render **51.0 s**, row READY with R2 asset. Also: web restart mid-render survived (29 s), 0 orphaned ffmpeg on worker kill, crash recovery via pg-boss retry (80 s), sweep ignores rows <30 min | — | — | — |
| MODEL-RETIREMENT | D-001 — retire all models except FLUX2/H3_MAX/VEED | Engineering | main | b68ebdf5, 5de63975 | — | DEPLOYED & VERIFIED | production `listModels` returns exactly FLUX2, H3_MAX, VEED_FABRIC; 11 retired credit rates inactive; enum values retained for ~1,700 historical jobs; 4 guard tests | — | — | — |
| VEED-SAFETY | D-075/D-076 — Fabric consent + input moderation + Whisper transcription | Engineering | main | 909c34c7, 1e446151, fcbd3a8d, 605dc218 | — | DEPLOYED & VERIFIED | Runtime-proven 2026-10-19T23:18Z: create-audit carries a real `jobId`, `path=per-second`, `image=allowed`, `audioSeconds=6.35`, `audioVerdict=allowed`, `transcriptHash` + `transcriptEmpty=false` (Whisper transcribed real audio and the text was moderated). **Incident:** gate was inert #84–#89 — a per-second early-return sat above it and `VIDEO_PER_SECOND_PRICING` is on in prod; fixed in #90 with a production-flag regression test. **Residuals:** the 3 jobs charged before the fix were unmoderated (outputs scanned `allowed`, inputs never inspected); transcripts are hashed by design, so the exact words are not auditable without re-running Whisper | — | — | — |
| AVATAR-PHASE-A | D-002 Phase A — dedicated `/avatar` surface for VEED Fabric | Engineering | main | c5f821c7, 56661b97 | — | DEPLOYED & VERIFIED | `/avatar` route 200; job `cmvhd9m2t01ls2a9m0xfygovn` COMPLETED, charged **2,100** on `generate:veed_fabric_720p`; `analytics_events` holds `avatar_page_view` (00:19:52Z) and `avatar_job_submitted` (00:21:11Z) joined to that jobId; creditCost payload now 2,100 (was 300) | **Signed-out `/avatar` views are not tracked** (`analytics.track` is protected) | Add public page-view event if guest funnels matter | — |
| AVATAR-PHASE-B | D-002 Phase B — Avatar Tab (Web) | Engineering | main | d958c5a9, 21b04bd, 1cbc6d4 | — | DEPLOYED & VERIFIED (Web) | **3-tier pricing** 480p/720p/1080p verified against the ledger at 1,125 / 2,100 / 3,000 on their own feature keys. **Browser audio upload**: presigned R2 PUT verified from a real browser. **Signed-out page views**: public tracking endpoint verified live (200, event written, no session). **Rejection path (duration gate)**: verified end-to-end with a real 359s audio file — `[veed.audit]` emitted `verdict: rejected`, `reason: audio_too_long`, `detail: receivedSeconds: 359`; **no job row created, no charge, balance unchanged** (37,125). **Approval path**: verified end-to-end with real jobs at all three tiers (480p 71s, 720p 25s, 1080p 59.9s). **Deferred**: Mobile parity (Phase B.2). **Operational blocker (not a code defect)**: fal.ai returns 403 (account locked / balance exhausted) — approval renders fail until topped up; the rejection path is unaffected. | — | Mobile parity (B.2) | — |

## Change log

| Date | ID | From â†’ To | Evidence | By |
|---|---|---|---|---|
| 2026-10-15 | â€” | Tracker created | SESSION.md | Claude |
| 2026-10-15 | P3-ENDCARD | DEPLOYED â†’ ACCEPTED | export cmv9ysnu40001n8xkzhwktjw6, 32.000s, endCardApplied=true | Claude |
| 2026-10-15 | STORY-PACE | PROPOSED â†’ IMPLEMENTED | Phase B: schema, flag, blueprint, narrative engine, story.ts, 32 tests green; type-check clean | Claude |
| 2026-10-18 | SEC-RATELIMIT | â€” â†’ DEPLOYED | PRs #68 (Redis limiter), #69 (exec-shape fix â€” limiter was inert), #70 (auth-route logging); prod verification: 5Ã—401 â†’ 429 with Retry-After | agent |
| 2026-10-18 | SEC-RATELIMIT-2 | â€” â†’ PROPOSED | D-067 Phase 2 (read fail-open / write fail-closed) | agent |
