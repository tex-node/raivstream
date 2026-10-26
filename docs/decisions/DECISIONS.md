# Raivstream â€” Decisions & Plans

The single place to record **what was decided, why, and where it is implemented**. Status of individual features lives in `docs/roadmap/feature-tracker.md`; the session-by-session work log lives in `SESSION.md`. This file is for decisions.

**Repo location:** `docs/decisions/DECISIONS.md`
**Owner:** one agent at a time (the agent that owns the change appends the entry in the same PR).
**Last updated:** 2026-10-18
**Verified against:** `origin/main` `46dbf0ce5f1b7c918848f7192c33d4582d4f148f` on 2026-10-16 (read-only pass â€” see â€œCode differsâ€ at the end).
**Re-verified:** `origin/main` `7678ba39` on 2026-10-18 â€” D-031 closed by PR #60 `41eb27b`; D-032 timeout path verified; see â€œCode differsâ€ for what still differs.

## How to use this file

- Add a new entry at the top of the relevant section. Never delete an entry; mark it `SUPERSEDED by D-xxx` instead.
- Each entry has: ID, date, decision, reason, where it lives (code / doc / PR), and status (`DECIDED`, `IN PROGRESS`, `DONE`, `SUPERSEDED`).
- If code disagrees with this file, stop and ask the owner. Don't silently "fix" either side.

---

## 1. Product scope & models

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-001 | 2026-10-15 | **Only three model families are in use: FLUX2 (images), MiniMax H3 (video), VEED (avatar / lipsync / Fabric).** Veo, Grok and every other model are retired. | Simplify pricing, margin control and support. | Model registry + seed; model-retirement PR (pending) | DECIDED, not yet implemented |
| D-002 | 2026-10-15 | **Avatar tab** using VEED avatar, as its own top-level tab. It is the highest-margin product. | Margin; distinct user flow from Story. | `docs/product/next-features.md` â€” Avatar section not present in that file yet | DECIDED; Phase A after pricing go-live |
| D-003 | 2026-10-16 | **STORY-PACE ships before Avatar.** | Demo on 2026-10-16. | â€” | DONE (demo ran) |
| D-004 | 2026-10-15 | **Media library** for every user, R16 included: view, download, delete, and post to the feed through moderation. R16 is built first. | Users had no place to find past generations; R16 had none at all. | `docs/product/next-features.md` (MEDIA-LIB) | DECIDED |
| D-005 | 2026-10-15 | **Admin insights**: per-user spend, credit purchases, media counts, likes and followers. | Operating visibility. | `docs/product/next-features.md` (ADMIN-INSIGHTS) | DECIDED |
| D-006 | 2026-10-15 | **Background generation (BG-JOBS)**: jobs keep running in the cloud when the user leaves the page. | Users lose work and credits when they navigate away. | `docs/architecture/background-jobs.md` (planned â€” file not yet in repo) | DESIGNED |

## 2. R16 rules

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-010 | 2026-10-15 | **R16 is limited to Anime, 3D Animation and Cartoon styles.** Enforced on style change (`assertR16VisualStyle`) and again at generation time (`enforceR16Style`). | Safety and brand: no photoreal R16 content. | `storyVisualStyles.ts`, `story.ts`; PR #42 | DONE |
| D-011 | 2026-10-15 | R16 access is guarded by `r16Procedure`; creative tools use `creativeProcedure` (`isNotR16`); sequences by `assertSequenceAllowed`. | Single choke points for R16 checks. | tRPC procedures | DONE |
| D-012 | 2026-10-16 | Narration for **R16 STORY projects must use the story path, not the educational path.** | Demo bug: R16 narration was routed to the educational flow. | PR B; `apps/web/src/lib/narrationPath.ts`, `ScenesScreen.tsx` | DONE |

## 3. Story & scene building

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-020 | 2026-10-15 | **STORY-PACE**: scene count follows story length. Short = 3â€“4 scenes, 12â€“25 narration words each; Medium = 5â€“7 scenes. Scene duration = `ceil(words / 2) + 2`, clamped to 4â€“15 s. The old `Math.max(beats.length, 6)` and fixed 5 s default are removed. | Short stories were stretched into 6 rushed scenes. | `story.ts` (`docs/architecture/story-pace.md` planned â€” not yet in repo) | DEPLOYED behind flag |
| D-021 | 2026-10-16 | STORY-PACE is gated by `STORY_PACE_ENABLED` plus the per-user allowlist `STORY_PACE_USER_IDS`. Only the allowlist is currently set (in `apps/web/.env.local`); the global `STORY_PACE_ENABLED` is unset. **Enabling it for everyone is an open decision.** | Controlled rollout. | `docs/operations/environment-layout.md` | OPEN: global enable |
| D-022 | 2026-10-16 | **Maximum 10 scenes per episode** (product proposal). Extra scenes become the next episode(s); export works per episode. | **Not a demo fix.** The 2026-10-16 demo failure was the ca25 `-stream_loop -1` runaway (D-031) on a 9-scene project â€” not scene count. Evidence: 11â€“18 scene projects export successfully (7 READY exports across 5 projects); the three largest projects (50â€“55 scenes) have never been exported. Reclassified as a product proposal for UX and future scalability, not a bug fix. | planned PR C (not opened) | DEFERRED |
| D-023 | 2026-10-15 | **Story scenes always generate at 480p.** | Cost and margin; matches the pricing model. | Generation + pricing | DECIDED |

## 4. Export

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-030 | 2026-10-16 | **Export must not require narration**, and must keep the clips' own audio (character dialogue). | Demo: exports blocked when narration was missing. | PR B; `storyVideoExportService.ts` (gate removed, all-or-nothing audio mode), `layout.tsx` (partial-narration warning) | DONE (option a). **Follow-up (option b):** per-scene narration with silence/clip-audio for the gaps between narrated scenes â€” not implemented |
| D-031 | 2026-10-16 | **Safe FFmpeg rules**: never `-stream_loop -1` on a clip with its own audio; no `-shortest` fallback; use `-t`; a hard timeout; a `-fs` file-size cap; `-threads 2`; **one export at a time.** | A runaway export ran 4h27m, wrote 20 GB and starved the shared VPS. | PR #58 (incomplete) â†’ PR #60 `41eb27b`; `ffmpegSafety.ts`, `render.ts`, `audioMixing.ts`, `movieRenderWorker.ts`, `lastFrameExtract.ts` | DONE (advisory lock deferred to D-033) |
| D-032 | 2026-10-16 | A failed export must leave the row in `FAILED` state, never stuck "exporting". | Users stuck exporting for 15+ minutes. | PR #55 (FAILED-row reuse) + PR #60 `41eb27b` (timeout â†’ FAILED) + D-033 (crash recovery) | DONE â€” timeout path verified; crash recovery ships with the worker: pg-boss retry recovers a killed render in ~80 s, and the startup sweep catches rows older than 30 min |
| D-033 | 2026-10-16 | **EXPORT-WORKER**: exports run in a dedicated PM2 process (`raivstream-worker`) via pg-boss. The web request validates, creates a `PENDING` row, enqueues, and returns immediately. Includes the two lifecycle fixes (wedged `FAILED` retry, wedged `GENERATING`), a startup sweep for crash-orphans, and `killAllChildren` on shutdown. | One bad export must not take down the web app (ca25). | PR #77 `eba6d67f` (worker), PR #78 `607d4c78` (PM2 deploy fix), PR #79 `5aa8a8a8` (D-073); `packages/api/src/lib/jobs/`, `worker/index.ts`, `ecosystem.config.cjs` | DEPLOYED â€” queue pickup ~1 s; web restart mid-render survived (**READY at 29 s**); **0 orphaned ffmpeg** on worker kill; crash recovery via pg-boss retry (~80 s), sweep correctly ignores rows <30 min. client request returned PENDING with no render (queue pickup **0.81 s**, real export cmvf0a2qg00dv2p5zl7sym3p3 rendered in **51.0 s** to READY) |

## 5. Pricing & credits

**Basis:** about **40% true margin** (margin, not markup) on the Pro pack at â‚¦0.80 per credit and about â‚¦1,331â€“1,400 per US dollar. Rates use the "higher column" the owner chose on 2026-10-15.

| ID | Date | Decision | Where | Status |
|---|---|---|---|---|
| D-040 | 2026-10-15 | **Video is charged per second** (`VIDEO_PER_SECOND_PRICING` flag). | PR #51; seed | IMPLEMENTED; go-live blocked by D-043 |
| D-041 | 2026-10-15 | **Rates, in credits per second.** VEED Fabric tiers: **480p 225/s** (1,125 for 5 s) · **720p 420/s** (2,100) · **1080p 600/s** (3,000). 1080p pricing rationale: pixel-proportional would be ~945/s (2.25x the 720p rate), but at that price a 5 s clip costs more than an H3_MAX 1080p video (1,280) and users revert to 720p; 600/s is a +43% premium step that stays defensible against the rest of the catalogue. **Implementation note:** `listModels.creditCost` returns the **default 720p tier** (2,100 for 5 s) for VEED_FABRIC because the shared AI Studio form defaults to 720p - it is NOT a "starting at" price. Use `creditCostByResolution` to display tier-specific pricing; 480p is the cheapest option at 1,125. | seed + `docs/architecture/story-pace-pricing.md` (requested) | DECIDED |

| Product | Resolution | Credits / second |
|---|---|---|
| MiniMax H3 turbo | 480p / 768p / 1080p | 80 / 128 / 256 |
| MiniMax recast | 768p / 1080p | 850 / 1,250 |
| MiniMax reference-to-video | 480p / 768p / 1080p | 140 / 225 / 450 |
| VEED Fabric | 480p / 720p | 225 / 420 |
| VEED lipsync | â€” | 200 |
| VEED avatar | â€” | 20 (1,200 per minute) |

| ID | Date | Decision | Where | Status |
|---|---|---|---|---|
| D-042 | 2026-10-15 | Credits use **reserve â†’ settle â†’ release** with a required (NOT NULL) `idempotencyKey` on every ledger write. | `credits.ts`, `schema.prisma`; PR #54 | DONE |
| D-043 | 2026-10-16 | **Fix the flag coupling before pricing go-live**: compensation is now decided by the reservation's own state, not by `CREDIT_RESERVE_SETTLE_ENABLED` / `VIDEO_PER_SECOND_PRICING`. Terminal settle/release are unconditional (no-ops without a HELD row); failure compensation releases when a reservation exists and refunds otherwise (no double compensation). `releaseStuckReservations()` now runs once per web process as the safety net. | PR #64 `4927c08`; `credits.ts` (`compensateFailedGeneration`), `generation.ts`, `story.ts`, `app/api/trpc/[trpc]/route.ts` | DONE â€” unblocks D-040 |
| D-044 | 2026-10-16 | **Goodwill credit of 5,000** each to the two users whose exports failed at the demo (oluwadarasimiopasina@gmail.com, emmanuelbalogun908@gmail.com). Production data change: confirm before running. | Admin action | PENDING approval |

## 6. Infrastructure & operations

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-050 | 2026-10-16 | **Move Raivstream to its own VPS.** Phase A: inventory and plan (read-only). Phase B: gated execution. Starts after PR A and PR B are deployed. | Raivstream exports share CPU/RAM with UltraLeague and Powervend; one runaway job hurts all apps. | `docs/operations/vps-migration.md` (planned) | PLANNED |
| D-051 | 2026-10-16 | Network storage and ComfyUI are **deferred** until after the export worker and VPS move. | Fix isolation first; measure before investing. | â€” | DEFERRED |
| D-052 | 2026-10-15 | **Nightly backups for every database**, with failure alerts by email (Resend) and an encrypted off-site copy in R2 (`vps-backups-raivstream`). Restore drill passed. | Data safety. | UltraLeague repo `deploy/ops/README.md`, `BACKUP_RESTORE.md` | DONE; R2 lifecycle rules pending (owner) |
| D-053 | 2026-10-15 | **VPS change rules**: back up â†’ write the file â†’ validate â†’ install once. Never pipe state-changing commands. Use the LF-only `ssh-remote.ps1` helper from Windows. Anything outside `/root/raivstream` is read-only unless the owner approves. | Crontab was wiped by a carriage-return bug. | `docs/operations/vps-change-rules.md` | DONE |
| D-054 | 2026-10-15 | **Env layout**: the web app reads `apps/web/.env.local`; `/root/raivstream/.env` is for the Prisma CLI and cron only. | A flag was set in the wrong file. | `docs/operations/environment-layout.md` (on branch `wip/triage-local`; not yet on `main`) | IN PROGRESS |
| D-055 | 2026-10-15 | **Migrations are expand/contract**, with runbook pre-flight and a backup before every apply. | 2026-10-13 mixed-state incident. | `docs/operations/migration-runbook.md` | DONE |
| D-066 | 2026-10-18 | **Moderation is not circuit-broken.** `promptModeration` (Layer 2 OpenAI scan) and `contentScanner` (upload/publish image scan) must NOT be routed through a circuit breaker. When OpenAI moderation is unavailable the policy is **retry with backoff, then fail the specific operation with a typed error â€” never silently skip, never allow unmoderated content.** | A breaker failing open means unmoderated content flows to the feed; failing closed means the whole platform stalls on an OpenAI wobble. Neither is acceptable. This does NOT affect the seven billing/execution breakers (fal, runpod, xai, kling, gemini, elevenlabs, lyria), where breakers are correct. | `promptModeration.ts`, `contentScanner.ts`; alternate moderation path + review queue deferred to Phase 2 | DECIDED â€” not implemented |
| D-067 | 2026-10-18 | **Redis is a hard dependency for API availability.** The rate limiter (`checkLimit`) throws on Redis failure rather than degrading to a no-limit state, so an Upstash outage is an API outage. **Phase 2 refinement:** split procedures by safety class â€” read-only (`feed.*`, `story.get*`) may fail open (serve the request, log the rate-limit miss), while mutations and expensive procedures (`generation.*`, `story.requestStoryVideoExport`) stay fail-closed. That preserves availability during a Redis wobble without opening an abuse vector. | A rate limiter that fails open is worse than no rate limiter: it gives false confidence during exactly the traffic patterns (abuse, runaway scripts) it exists to stop. If Redis is down, the correct behavior is to reject requests we cannot verify. | `packages/api/src/lib/resilience/rateLimit.ts` (fail-closed); Phase 2 not implemented | DECIDED â€” fail-closed everywhere, no procedure exempt |
| D-068 | 2026-10-18 | **Cache fails open; rate limiter fails closed.** Two Redis-backed systems with deliberately opposite failure policies. `checkLimit` (D-067) throws on Redis failure. `cached()` falls through to `fn()`, returns the result uncached, and logs. **Rules:** the cache never throws on infrastructure failure (it degrades to "no cache"); it must never serve past its TTL, and never serve data a write should have invalidated. A lost key is a miss (safe); a stale key is a bug â€” the invalidation hook missed something. | The two systems protect different things. The rate limiter protects against abuse, so failing open there is dangerous. The cache protects against load, so failing closed would turn every miss into an API outage â€” worse than having no cache. | `packages/api/src/lib/cache/index.ts` | DECIDED â€” implemented |
| D-069 | 2026-10-18 | **Authorization state is never cached.** User role, ban state, premium tier, and any field consulted by `isAdmin`, `isAuthed`, or authorization middleware must be read fresh on every request. **Consequence:** the tRPC context user lookup is not a cache target, ever. If it becomes a load problem, the fix is a read replica or connection pooling, not caching. | Caching these fields creates a window where a demoted user still has admin powers or a banned user still has access. The 0.05 ms saved is not worth the privilege-escalation risk. | `packages/api/src/trpc.ts` context (deliberately uncached) | DECIDED â€” permanent |
| D-070 | 2026-10-18 | **`story.getWorkspace` caching is deferred.** It is the second-hottest read (â‰ˆ18.4k `story_projects` + 9.8k `story_scene_seeds` + 4.4k `story_scene_assets` statement calls; assets return ~17 rows each), but it needs its own key design and invalidation surface before it can be cached safely. | It is per-user (the key must include `userId` or one creator sees another's project), fans out over 3â€“5 joins, and a dozen scene/asset procedures mutate it â€” the invalidation matrix is the work, not the cache call. Prove the pattern on the three global paths first. | `story.ts` (deliberately uncached) | DEFERRED |
| D-071 | 2026-10-18 | **Interactions rely on TTL, not invalidation.** `feed.trending` and `feed.forYou` are cached for 30 s. Invalidation fires on feed *membership* changes (publish, delete, moderate, withdraw, resubmit) but NOT on engagement changes (like, dislike, rating, view, follow). **Consequence:** a like may not affect feed order for up to 30 s. | Interaction mutations call `recomputeEngagementScore(...).catch(() => {})` fire-and-forget (`interaction.ts:76, 130, 160, 183, 253`). They return before the score is durable, so invalidating on them would repopulate the cache from pre-recompute ordering and the recompute would land with no invalidation â€” a wrong order for the full TTL. A 30 s stale ordering is acceptable; a permanently wrong one is not. | `packages/api/src/routers/feed.ts`, `interaction.ts` (deliberately no hooks) | DECIDED |
| D-072 | 2026-10-18 | **Make `recomputeEngagementScore` awaited before the interaction mutation returns.** Prerequisite for immediate-consistency invalidation on interactions (D-071's deferred half). | Fire-and-forget recompute is what makes interaction invalidation unsafe today. | `interaction.ts` | DEFERRED â€” separate PR |
| D-073 | 2026-10-18 | **Export artifact fields are written by the worker, not the request.** After the sync â†’ async split (D-033), `assetUrl` / `r2Key` / `endCardApplied` / `completedAt` are written during `runExportJob` â€” after the render â€” not during `requestExport`. Anything reading the row immediately after `requestStoryVideoExport` sees `PENDING` with no artifact fields; consumers must poll until `READY`. | The request must return fast, so it cannot carry render output. The UI polling contract already handles this; the danger is a future test or caller assuming the row is complete after the initial call. Two existing tests were written against "first update contains the artifact" and broke in exactly this way. | `storyVideoExportService.ts` (`requestExport` vs `runExportJob`); tests must assert on the last update | DECIDED |
| D-074 | 2026-10-18 | **R16 video export is KIDS-only, and the UI now enforces it too.** The server requires both an R16 session (`requireR16`, FORBIDDEN at `trpc.ts:129`) and a `KIDS`-mode project (FORBIDDEN at `storyVideoExportService.ts:208`). The UI gated on the R16 host alone, so a `GENERAL` project opened on `r16.raivstream.com` rendered an Export button that always returned 403. Both export surfaces now use `canExportStoryVideo({ isR16, audienceMode })` and show â€œVideo export is only available for R16 (Kids) projects.â€ instead of the button. | A button that is guaranteed to fail is a UX bug, not a permission design: the server was right, the UI lied about it. | `apps/web/src/lib/exportEligibility.ts`, `story-playground/new/page.tsx`, `[projectId]/layout.tsx` | DONE |
| D-075 | 2026-10-18 | **Model retirement (D-001) without dropping enum values.** Only FLUX2 (images), H3_MAX (video) and VEED_FABRIC (avatar) may create new jobs. Enforced at three layers: `SUPPORTED_MODELS` (the API `z.enum`, so a retired id fails schema validation before any handler runs), `MODEL_META.hidden` (removes them from `listModels` â€” the surface the mobile client consumes), and `FeatureCreditRate.isActive=false` (11 rows, so nothing can price a retired model). Retired ids stay in the `GenerationModel` enum and in `MODEL_FEATURE_KEY` so historical jobs and their refunds still resolve. | Postgres cannot drop enum values in place, and the enum serves ~1,700 historical jobs; removing them would mean rebuilding the type. Hiding is reversible and auditable, and the three layers mean no single revert silently re-enables a provider. **VEED_FABRIC was un-hidden by owner decision even though UGC consent/ownership/moderation controls are still unimplemented** â€” that risk was accepted explicitly, not overlooked. | `routers/generation.ts` (`SUPPORTED_MODELS`), `lib/generators/index.ts` (`MODEL_META`), `feature_credit_rates`, `generate/page.tsx` (`ALLOWED_MODELS`), `modelRetirement.test.ts` | DONE |
| D-077 | 2026-10-19 | **Phase 1 Operational Hardening — streak complete.** Rate limiting (11 buckets, fail-closed), circuit breakers (7 providers), Redis read cache (fail-open, authz never cached), export worker migration (pg-boss + dedicated PM2 process), model retirement (D-001/D-075), and VEED Fabric safety gates (D-076) are all deployed. | Six independent failure classes — runaway FFmpeg, provider outage, traffic spikes, unmoderated UGC, unsupported models, wedged exports — each now has an enforced control rather than a documented intention. | D-031…D-076 across `packages/api/src/lib/`, `apps/web/src/`, `ecosystem.config.cjs` | DEPLOYED & VERIFIED — all six controls proven; no open residuals on this phase |
| D-081 | 2026-10-20 | **Shadowed control flow incident (VEED Fabric).** From #84 to #89 the Fabric safety gate — consent, file-type, image moderation, Whisper transcription — was **completely inert in production**. `generation.create` returns early through `createWithReserveSettle` when `VIDEO_PER_SECOND_PRICING` is on (it is, in production), and that return sat **above** the gate, so none of it ran. Three jobs completed and charged 2,100 credits each with zero input moderation. Caught only because the owner refused "deployed + health 200" and demanded the runtime audit line; its absence triggered the investigation. Fixed in #90 by gating the per-second branch too, plus a regression test that runs with `VIDEO_PER_SECOND_PRICING=1`. | An early `return` is an invisible boundary: every downstream safety or correctness check becomes optional depending on a flag that is set elsewhere and tested nowhere. The tests all drove the *default* configuration, so they proved the gate worked on a path production never takes. | `routers/generation.ts`, `routers/__tests__/generationVeed.test.ts` | DONE — verified at runtime (audit line with `path=per-second`) |
| D-082 | 2026-10-21 | **D-002 Phase A complete; `/avatar` is the canonical entry point for VEED Fabric.** The dedicated surface reuses `generation.create` + `generateFormShape`, shows the true per-second price (2,100 for 5 s at 720p), and records server-side `avatar_*` events with a property allowlist. Verified at runtime: page → job → ledger → safety audit → analytics all join on one `jobId`. Phase B.1 adds a 480p/720p picker (1,125 / 2,100) and a presigned audio upload so creators no longer paste URLs. | A model buried in a generic dropdown competes with image and video models for attention and forces one form to hide half its own fields. A dedicated surface can price, validate and measure the product on its own terms. | `apps/web/src/app/avatar/page.tsx`, `routers/generation.ts` (`requestAudioUpload`), `lib/generationCost.ts`, `routers/analytics.ts` | DONE (A) / DEPLOYED & VERIFIED (B, web). **Phase B closure (2026-10-26):** the rejection path is proven at runtime, not just unit-tested — a real 359s audio submission returned `audio_too_long`, wrote a `[veed.audit]` line carrying the actual duration, created no job row, and charged no credits. Combined with approval-path verification at all three tiers (1,125 / 2,100 / 3,000 on their own keys), the Avatar Tab (Web) now has runtime evidence for both success and failure. Mobile parity remains deferred. |

## 7. How we work with agents

> **Safety invariants are not circuit-breakable.** Moderation, credit deduction,
> and audit logging are correctness boundaries, not performance optimizations. A
> circuit breaker must never answer "what happens when this is down?" â€” that is a
> policy decision, recorded in this file (see D-066).

| ID | Date | Decision | Reason |
|---|---|---|---|
| D-060 | 2026-10-16 | **One agent per repository at a time.** | Parallel agents kept overwriting each other's work. |
| D-061 | 2026-10-15 | Investigator agents are **read-only**. | Investigations must not change state. |
| D-062 | 2026-10-15 | **No production data edits without asking the owner first.** | Safety. |
| D-063 | 2026-10-15 | Never print or commit secrets; never paste session cookies into chat. | Security. |
| D-064 | 2026-10-15 | Merge with `--admin` only after CI is green. Always branch from fresh `main`. | PR #42 had to be redone after work on a branch 129 commits behind. |
| D-065 | 2026-10-15 | Feature status uses the ladder `PROPOSED â†’ DESIGNED â†’ IMPLEMENTED â†’ TESTED â†’ CI-GREEN â†’ STAGING-QUALIFIED â†’ DEPLOYED â†’ ACCEPTED`, tracked in `docs/roadmap/feature-tracker.md`. | One shared vocabulary. |

---

## Current plan (order of work)

1. **PR A**: safe FFmpeg export (D-031). **DONE** â€” PR #58 + PR #60 (`41eb27b`).
2. **PR B**: combined hotfix: export without narration, R16 narration routing, FAILED rows (D-012, D-030, D-032). **In progress.**
3. **Goodwill credits** (D-044), after owner approval.
4. **EXPORT-WORKER** Phase A (D-033) â€” **DONE** (PR #77, PM2 deploy fix #78, D-073 #79).
5. **VPS migration** Phase A (D-050), once PR A and PR B are deployed.
6. **Fix the reserve/settle flag coupling** (D-043) â€” **DONE** (PR #64). Next: **per-second pricing go-live** (D-040, D-041), now unblocked.
7. **Model retirement** (D-001).
8. **Avatar** Phase A (D-002).
9. **MEDIA-LIB**, R16 first (D-004).
10. **ADMIN-INSIGHTS** (D-005).
11. **BG-JOBS** (D-006).

**Owner actions:** set the Cloudflare R2 lifecycle rules (may need the encrypted prefixes); review PR #44 (auth refresh race).

## Open decisions

- Enable STORY-PACE for everyone, or keep the allowlist? (D-021)
- Set `narrationText` when scenes are created for EDUCATIONAL projects?
- End card: fail-closed or best-effort when it can't render?

## Product decisions (deferred)

- **D-022 â€” 10-scene episode cap.** Deferred pending evidence. It is **not** a bug
  fix: the 2026-10-16 demo failure was the ca25 `-stream_loop -1` runaway (D-031)
  on a **9-scene** project, and 11â€“18 scene projects export successfully today.
  Any implementation also carries a real behaviour change â€” `EPISODE_REQUIRED`
  for multi-episode projects â€” which would break `scripts/f5_acceptance.mjs`
  (a server-side caller), not just the UI.

  > **Untested risk:** a 50+ input concat has never run in production. Real but
  > untested â€” plausible concern (filter graph size, memory, the `-t 1800` cap,
  > `-fs 2G`). Before any episode-cap implementation, the owner should validate by
  > exporting a 15â€“30 scene project and confirming success. If it succeeds, D-022
  > is pure UX and can be sized honestly. If it fails, the `errorMessage` reveals
  > the actual mechanism (cap/memory/wall-clock) and the fix is aimed correctly.

## Code differs from a decision (verified 2026-10-16 @ `46dbf0c`)

- **Code differs â€” D-001:** the model registry still exposes non-FLUX2/H3/VEED models. `enum GenerationModel` (`schema.prisma`) still contains `NANO_BANANA, GROK_IMAGINE, LTX2, WAN_25, KLING, KLING_I2V, KLING_R2V, HIGGSFIELD, VEO3, FLUX, HUNYUAN_VIDEO, COG_VIDEO_X, SEEDANCE` (plus `FLUX2, FLUX2_EDIT, H3_MAX, VEED_FABRIC`), and `MODEL_META` still defines several of them. Retirement not yet implemented (as stated).
- **Code differs â€” D-020:** `Math.max(effectiveBlueprint.beats.length, 6)` is **still present** (`packages/api/src/routers/story.ts:4794`) as the fallback for `storyLength=null`, and the fixed 5 s duration fallback (`?? 5`) is still present in the scene-video duration expression. The tier limits and `ceil(words/2)+2` clamp themselves are implemented (`storyIntelligence/types.ts:213-214`, `storyPaceHelpers.ts:23-26`).
- **Code differs â€” D-030 (RESOLVED):** the educational `PRECONDITION_FAILED` gate is gone (PR B). Export now uses narration only when every scene has it and otherwise falls back to clip audio; partial narration shows a warning in the export UI. Option (b) â€” keeping existing cues and filling gaps â€” remains a follow-up.
- **Code differs â€” D-031 (RESOLVED):** closed by PR #60 `41eb27b`. The caps are now inserted at the output section and wired into `runFfmpeg` as a single choke point, `-shortest` is gone from the audio mux (it takes the canonical runtime with an explicit `-t`), and probe spawns are bounded by `FFMPEG_PROBE_TIMEOUT_MS`. The **one-export-at-a-time** guard is the only part still unimplemented â€” it ships with D-033 as an advisory lock.
- **Code differs â€” D-032:** the timeout path now marks the row `FAILED` (PR #60). Still missing: a crash-recovery sweep for rows left `GENERATING` when the process dies mid-render â€” deferred to D-033's worker startup sweep.
- **Code differs â€” D-040 (config, not code):** `VIDEO_PER_SECOND_PRICING` is set in `/root/raivstream/.env` but **not** in `apps/web/.env.local`, so the running web process does not see it (`pm2 env 0` has no such var). The flag is effectively **off** in production even though the rates are seeded.
