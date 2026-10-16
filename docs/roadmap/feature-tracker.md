# Raivstream Feature Tracker

Single source of truth for feature status. Update on every status change and link from `SESSION.md`.

Seeded 2026-10-15 from `SESSION.md` (latest entries 2026-10-12 / 2026-10-13). Verify each row against the repo, CI and the VPS before relying on it.

## Status ladder

Use these exact words. Never collapse them.

`PROPOSED → DESIGNED → IMPLEMENTED → TESTED → CI-GREEN → STAGING-QUALIFIED → DEPLOYED → ACCEPTED`

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

- Production HEAD: `a9cb10f` (verify: `git -C /root/raivstream rev-parse HEAD`)
- Upgrade branch: `feat/raivstream-upgrade` → Draft PR #4, HEAD `c8f4adb`, 34 commits on `a9cb10f`
- CI on PR #4: `test-unit` PASS; `test-integration` 14/14 but job red on stale count assertion (4 → 14) in `.github/workflows/{ci,deploy}.yml`
- Migrations: 9 upgrade migrations in **mixed** state after the 2026-10-13 incident (`…140000_not_null` applied then rolled back). Reconcile against `_prisma_migrations` before any apply. See `docs/operations/migration-runbook.md`.

## Features

| ID | Feature | Track | Branch | Key commits | Migrations | Status | Evidence | Blocking gate | Next action | Owner |
|---|---|---|---|---|---|---|---|---|---|---|
| P1-CREDITS | Credit ledger idempotency | Engineering | feat/raivstream-upgrade | ede6c45, c8f4adb | upgrade §4 (incl. `20261012130000` backfill, `20261012140000` not_null) | TESTED | upgrade-plan-closing-status.md | CI count fix; mixed migration state | Reconcile prod migrations; fix CI 4→14 | — |
| PL-01 | Admin usage reporting | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | upgrade-plan-closing-status.md | PR #4 CI + staging | Staging verification | — |
| MUSIC-PERCUE | Music charge per-cue fix | Engineering | feat/raivstream-upgrade | c8f4adb | — | TESTED | SESSION.md 2026-10-12 | CI count assertion | Fix ci/deploy.yml count | — |
| R16-02 | R16 visual styles (Cartoon/Anime/3D) | Product | feat/raivstream-upgrade | 682202c | — | TESTED | phase-2-release-evidence.md | Legacy-project E2E | Staging E2E incl. legacy projects | — |
| R16-03 | Character reference approval + continuity | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | phase-2-release-evidence.md | Staging evidence | Multi-scene acceptance run | — |
| R16-04 | Batch scene generation | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | phase-2-release-evidence.md | Staging evidence | Partial-failure + credit reconciliation on staging | — |
| R16-05 | Chapter version history | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | phase-2-release-evidence.md | Staging evidence | Snapshot/restore on staging | — |
| P3-ENDCARD | Two-second end card | Product | main | c85dd48 | `20261009110000` (endCardApplied col) | ACCEPTED | export cmv9ysnu40001n8xkzhwktjw6: 32.000s video=audio, endCardApplied=true, frame "Created on Raivstream / @fothlog" | — | — | — |
| P4A-PUBLISH | R16 publication lifecycle | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | phase-4-release-evidence.md | Privacy/permission tests on staging | Staging verification | — |
| P4B-SHARE | Share links + per-click attribution (90-day, no IP) | Product | feat/raivstream-upgrade | — | upgrade §4 | TESTED | phase-4-release-evidence.md | Staging verification | Staging verification | — |
| R16-EXPORT | R16 story video export (2A–2D) | Product | (confirm branch) | — | `20260925180000_story_video_export` | TESTED | SESSION.md 2026-09-25/26 | Migration + VPS acceptance (2H/2I) | Phase 2H real acceptance | — |
| EDU-B | Educational intent/content contract | Product | (confirm branch) | — | `20260926120000_educational_contract` | TESTED | SESSION.md 2026-09-26 | Migration deploy | Deploy migration | — |
| EDU-C-G | Educational narration, visuals, QA, prod test | Product | — | — | — | PROPOSED | — | EDU-B deployed | Design Phase C | — |
| R16-STYLE-LOCK | R16 generation-time style enforcement (KIDS → CARTOON) | Engineering | main | 5556178 | — | DEPLOYED | PR #42 | — | — | — |
| STORY-PACE | Story length/pacing choice (Short/Medium/Long, write-to-budget, beats=scenes) | Product | feat/story-pace | — | `20261015130000_story_length` | IMPLEMENTED | — | Staging run + 8-idea baseline | Phase B code done; staging run + one real Short R16 story | — |
| MEDIA-LIB | Unified user media library (view, download, soft-delete, post to feed; R16 first) | Product | — | — | TBD | PROPOSED | docs/product/next-features.md | STORY-PACE Phase A | Phase A: inventory + design | — |
| ADMIN-INSIGHTS | Per-user admin view (credit spend, purchases, media, engagement; CSV) | Product | — | — | TBD | PROPOSED | docs/product/next-features.md | — | Phase A: data inventory + design | — |
| R16-AUDIO | R16 narration + music + FFmpeg mux | Product | main (unpushed?) | c188f76, 4330faa, 9d8ca17 | `20261009120000`, `20261009130000` | TESTED | r16-video-audio-phase-abc-verification.md | Staging S1–S11; speech rate seed | Staging acceptance | — |
| REF-UPLOAD | Creative reference upload (`attachments[].url`) | Product | — | — | TBD | PROPOSED | SESSION.md 2026-09-23 (gap C) | — | Design binary upload → R2 | — |
| SEQ-9A | Sequence Workspace / timeline | Product | main | f5529bb | `20260823090000` | DEPLOYED | phase-9a-staging-qualification.md | — | Human acceptance | — |
| MOVIE-9B1 | Movie Builder deterministic render | Product | main | — | `20260823170000` | DEPLOYED | phase-9b1-staging-qualification.md | — | Human acceptance | — |
| AUDIO-9B2 | Audio & Performance layer | Product | (confirm) | — | `20260827120000`, `20260827180000` | STAGING-QUALIFIED | phase-9b2-staging-qualification.md | Production release | Confirm prod status; plan release | — |
| CREATIVE-5 | Raivstream 5.0 semantic studio | Product | main | 8b1049a | several | DEPLOYED | phase-9-final-launch-acceptance.md | Human UX acceptance | Run UX sessions | — |
| WB-7A | World Builder | Product | feat/world-builder | — | TBD | PROPOSED | Story Playground Concept | Release gates first | Architecture doc + ADR | — |
| TL-7B | Timeline editor integration | Product | — | — | — | PROPOSED | — | Reconcile with SEQ-9A | Gap analysis vs SEQ-9A | — |
| MOVIE-7C | Movie Builder from timeline | Product | — | — | — | PROPOSED | — | TL-7B | Design | — |
| TRANS-7D | Scene transition generator | Product | — | — | — | PROPOSED | — | MOVIE-7C | Design | — |
| P8-UNIVERSE | Voice, music, shared universes | Product | — | — | — | PROPOSED | — | AUDIO + WB-7A | Reconcile existing audio work | — |

## Change log

| Date | ID | From → To | Evidence | By |
|---|---|---|---|---|
| 2026-10-15 | — | Tracker created | SESSION.md | Claude |
| 2026-10-15 | P3-ENDCARD | DEPLOYED → ACCEPTED | export cmv9ysnu40001n8xkzhwktjw6, 32.000s, endCardApplied=true | Claude |
| 2026-10-15 | STORY-PACE | PROPOSED → IMPLEMENTED | Phase B: schema, flag, blueprint, narrative engine, story.ts, 32 tests green; type-check clean | Claude |
