# Raivstream — Decisions & Plans

The single place to record **what was decided, why, and where it is implemented**. Status of individual features lives in `docs/roadmap/feature-tracker.md`; the session-by-session work log lives in `SESSION.md`. This file is for decisions.

**Repo location:** `docs/decisions/DECISIONS.md`
**Owner:** one agent at a time (the agent that owns the change appends the entry in the same PR).
**Last updated:** 2026-10-18
**Verified against:** `origin/main` `46dbf0ce5f1b7c918848f7192c33d4582d4f148f` on 2026-10-16 (read-only pass — see “Code differs” at the end).
**Re-verified:** `origin/main` `7678ba39` on 2026-10-18 — D-031 closed by PR #60 `41eb27b`; D-032 timeout path verified; see “Code differs” for what still differs.

## How to use this file

- Add a new entry at the top of the relevant section. Never delete an entry; mark it `SUPERSEDED by D-xxx` instead.
- Each entry has: ID, date, decision, reason, where it lives (code / doc / PR), and status (`DECIDED`, `IN PROGRESS`, `DONE`, `SUPERSEDED`).
- If code disagrees with this file, stop and ask the owner. Don't silently "fix" either side.

---

## 1. Product scope & models

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-001 | 2026-10-15 | **Only three model families are in use: FLUX2 (images), MiniMax H3 (video), VEED (avatar / lipsync / Fabric).** Veo, Grok and every other model are retired. | Simplify pricing, margin control and support. | Model registry + seed; model-retirement PR (pending) | DECIDED, not yet implemented |
| D-002 | 2026-10-15 | **Avatar tab** using VEED avatar, as its own top-level tab. It is the highest-margin product. | Margin; distinct user flow from Story. | `docs/product/next-features.md` — Avatar section not present in that file yet | DECIDED; Phase A after pricing go-live |
| D-003 | 2026-10-16 | **STORY-PACE ships before Avatar.** | Demo on 2026-10-16. | — | DONE (demo ran) |
| D-004 | 2026-10-15 | **Media library** for every user, R16 included: view, download, delete, and post to the feed through moderation. R16 is built first. | Users had no place to find past generations; R16 had none at all. | `docs/product/next-features.md` (MEDIA-LIB) | DECIDED |
| D-005 | 2026-10-15 | **Admin insights**: per-user spend, credit purchases, media counts, likes and followers. | Operating visibility. | `docs/product/next-features.md` (ADMIN-INSIGHTS) | DECIDED |
| D-006 | 2026-10-15 | **Background generation (BG-JOBS)**: jobs keep running in the cloud when the user leaves the page. | Users lose work and credits when they navigate away. | `docs/architecture/background-jobs.md` (planned — file not yet in repo) | DESIGNED |

## 2. R16 rules

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-010 | 2026-10-15 | **R16 is limited to Anime, 3D Animation and Cartoon styles.** Enforced on style change (`assertR16VisualStyle`) and again at generation time (`enforceR16Style`). | Safety and brand: no photoreal R16 content. | `storyVisualStyles.ts`, `story.ts`; PR #42 | DONE |
| D-011 | 2026-10-15 | R16 access is guarded by `r16Procedure`; creative tools use `creativeProcedure` (`isNotR16`); sequences by `assertSequenceAllowed`. | Single choke points for R16 checks. | tRPC procedures | DONE |
| D-012 | 2026-10-16 | Narration for **R16 STORY projects must use the story path, not the educational path.** | Demo bug: R16 narration was routed to the educational flow. | PR B; `apps/web/src/lib/narrationPath.ts`, `ScenesScreen.tsx` | DONE |

## 3. Story & scene building

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-020 | 2026-10-15 | **STORY-PACE**: scene count follows story length. Short = 3–4 scenes, 12–25 narration words each; Medium = 5–7 scenes. Scene duration = `ceil(words / 2) + 2`, clamped to 4–15 s. The old `Math.max(beats.length, 6)` and fixed 5 s default are removed. | Short stories were stretched into 6 rushed scenes. | `story.ts` (`docs/architecture/story-pace.md` planned — not yet in repo) | DEPLOYED behind flag |
| D-021 | 2026-10-16 | STORY-PACE is gated by `STORY_PACE_ENABLED` plus the per-user allowlist `STORY_PACE_USER_IDS`. Only the allowlist is currently set (in `apps/web/.env.local`); the global `STORY_PACE_ENABLED` is unset. **Enabling it for everyone is an open decision.** | Controlled rollout. | `docs/operations/environment-layout.md` | OPEN: global enable |
| D-022 | 2026-10-16 | **Maximum 10 scenes per episode.** Extra scenes become the next episode(s). Export works per episode. | Demo: projects reached 15–30+ scenes, and exports failed. | planned PR C (not opened) | IN PROGRESS |
| D-023 | 2026-10-15 | **Story scenes always generate at 480p.** | Cost and margin; matches the pricing model. | Generation + pricing | DECIDED |

## 4. Export

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-030 | 2026-10-16 | **Export must not require narration**, and must keep the clips' own audio (character dialogue). | Demo: exports blocked when narration was missing. | PR B; `storyVideoExportService.ts` (gate removed, all-or-nothing audio mode), `layout.tsx` (partial-narration warning) | DONE (option a). **Follow-up (option b):** per-scene narration with silence/clip-audio for the gaps between narrated scenes — not implemented |
| D-031 | 2026-10-16 | **Safe FFmpeg rules**: never `-stream_loop -1` on a clip with its own audio; no `-shortest` fallback; use `-t`; a hard timeout; a `-fs` file-size cap; `-threads 2`; **one export at a time.** | A runaway export ran 4h27m, wrote 20 GB and starved the shared VPS. | PR #58 (incomplete) → PR #60 `41eb27b`; `ffmpegSafety.ts`, `render.ts`, `audioMixing.ts`, `movieRenderWorker.ts`, `lastFrameExtract.ts` | DONE (advisory lock deferred to D-033) |
| D-032 | 2026-10-16 | A failed export must leave the row in `FAILED` state, never stuck "exporting". | Users stuck exporting for 15+ minutes. | PR #55 (FAILED-row reuse, merged) + PR #60 `41eb27b` (timeout → FAILED) | IN PROGRESS — timeout path verified in PR #60; crash-recovery sweep (stuck GENERATING rows on process death) ships with D-033 (worker startup sweep) |
| D-033 | 2026-10-16 | **EXPORT-WORKER**: move exports out of the `raivstream-web` process into an isolated worker. | One bad export must not take down the web app. | `docs/architecture/export-worker.md` (planned) | PLANNED — next task after PR B. **Blocked by D-030**: the worker cannot deliver value while exports still require narration. |

## 5. Pricing & credits

**Basis:** about **40% true margin** (margin, not markup) on the Pro pack at ₦0.80 per credit and about ₦1,331–1,400 per US dollar. Rates use the "higher column" the owner chose on 2026-10-15.

| ID | Date | Decision | Where | Status |
|---|---|---|---|---|
| D-040 | 2026-10-15 | **Video is charged per second** (`VIDEO_PER_SECOND_PRICING` flag). | PR #51; seed | IMPLEMENTED; go-live blocked by D-043 |
| D-041 | 2026-10-15 | **Rates, in credits per second:** | seed + `docs/architecture/story-pace-pricing.md` (requested) | DECIDED |

| Product | Resolution | Credits / second |
|---|---|---|
| MiniMax H3 turbo | 480p / 768p / 1080p | 80 / 128 / 256 |
| MiniMax recast | 768p / 1080p | 850 / 1,250 |
| MiniMax reference-to-video | 480p / 768p / 1080p | 140 / 225 / 450 |
| VEED Fabric | 480p / 720p | 225 / 420 |
| VEED lipsync | — | 200 |
| VEED avatar | — | 20 (1,200 per minute) |

| ID | Date | Decision | Where | Status |
|---|---|---|---|---|
| D-042 | 2026-10-15 | Credits use **reserve → settle → release** with a required (NOT NULL) `idempotencyKey` on every ledger write. | `credits.ts`, `schema.prisma`; PR #54 | DONE |
| D-043 | 2026-10-16 | **Fix the flag coupling before pricing go-live**: compensation is now decided by the reservation's own state, not by `CREDIT_RESERVE_SETTLE_ENABLED` / `VIDEO_PER_SECOND_PRICING`. Terminal settle/release are unconditional (no-ops without a HELD row); failure compensation releases when a reservation exists and refunds otherwise (no double compensation). `releaseStuckReservations()` now runs once per web process as the safety net. | PR #64 `4927c08`; `credits.ts` (`compensateFailedGeneration`), `generation.ts`, `story.ts`, `app/api/trpc/[trpc]/route.ts` | DONE — unblocks D-040 |
| D-044 | 2026-10-16 | **Goodwill credit of 5,000** each to the two users whose exports failed at the demo (oluwadarasimiopasina@gmail.com, emmanuelbalogun908@gmail.com). Production data change: confirm before running. | Admin action | PENDING approval |

## 6. Infrastructure & operations

| ID | Date | Decision | Reason | Where | Status |
|---|---|---|---|---|---|
| D-050 | 2026-10-16 | **Move Raivstream to its own VPS.** Phase A: inventory and plan (read-only). Phase B: gated execution. Starts after PR A and PR B are deployed. | Raivstream exports share CPU/RAM with UltraLeague and Powervend; one runaway job hurts all apps. | `docs/operations/vps-migration.md` (planned) | PLANNED |
| D-051 | 2026-10-16 | Network storage and ComfyUI are **deferred** until after the export worker and VPS move. | Fix isolation first; measure before investing. | — | DEFERRED |
| D-052 | 2026-10-15 | **Nightly backups for every database**, with failure alerts by email (Resend) and an encrypted off-site copy in R2 (`vps-backups-raivstream`). Restore drill passed. | Data safety. | UltraLeague repo `deploy/ops/README.md`, `BACKUP_RESTORE.md` | DONE; R2 lifecycle rules pending (owner) |
| D-053 | 2026-10-15 | **VPS change rules**: back up → write the file → validate → install once. Never pipe state-changing commands. Use the LF-only `ssh-remote.ps1` helper from Windows. Anything outside `/root/raivstream` is read-only unless the owner approves. | Crontab was wiped by a carriage-return bug. | `docs/operations/vps-change-rules.md` | DONE |
| D-054 | 2026-10-15 | **Env layout**: the web app reads `apps/web/.env.local`; `/root/raivstream/.env` is for the Prisma CLI and cron only. | A flag was set in the wrong file. | `docs/operations/environment-layout.md` (on branch `wip/triage-local`; not yet on `main`) | IN PROGRESS |
| D-055 | 2026-10-15 | **Migrations are expand/contract**, with runbook pre-flight and a backup before every apply. | 2026-10-13 mixed-state incident. | `docs/operations/migration-runbook.md` | DONE |

## 7. How we work with agents

| ID | Date | Decision | Reason |
|---|---|---|---|
| D-060 | 2026-10-16 | **One agent per repository at a time.** | Parallel agents kept overwriting each other's work. |
| D-061 | 2026-10-15 | Investigator agents are **read-only**. | Investigations must not change state. |
| D-062 | 2026-10-15 | **No production data edits without asking the owner first.** | Safety. |
| D-063 | 2026-10-15 | Never print or commit secrets; never paste session cookies into chat. | Security. |
| D-064 | 2026-10-15 | Merge with `--admin` only after CI is green. Always branch from fresh `main`. | PR #42 had to be redone after work on a branch 129 commits behind. |
| D-065 | 2026-10-15 | Feature status uses the ladder `PROPOSED → DESIGNED → IMPLEMENTED → TESTED → CI-GREEN → STAGING-QUALIFIED → DEPLOYED → ACCEPTED`, tracked in `docs/roadmap/feature-tracker.md`. | One shared vocabulary. |

---

## Current plan (order of work)

1. **PR A**: safe FFmpeg export (D-031). **DONE** — PR #58 + PR #60 (`41eb27b`).
2. **PR B**: combined hotfix: export without narration, R16 narration routing, FAILED rows (D-012, D-030, D-032). **In progress.**
3. **PR C**: 10-scene episode cap with per-episode export (D-022).
4. **Goodwill credits** (D-044), after owner approval.
5. **EXPORT-WORKER** Phase A (D-033).
6. **VPS migration** Phase A (D-050), once PR A and PR B are deployed.
7. **Fix the reserve/settle flag coupling** (D-043) — **DONE** (PR #64). Next: **per-second pricing go-live** (D-040, D-041), now unblocked.
8. **Model retirement** (D-001).
9. **Avatar** Phase A (D-002).
10. **MEDIA-LIB**, R16 first (D-004).
11. **ADMIN-INSIGHTS** (D-005).
12. **BG-JOBS** (D-006).

**Owner actions:** set the Cloudflare R2 lifecycle rules (may need the encrypted prefixes); review PR #44 (auth refresh race).

## Open decisions

- Enable STORY-PACE for everyone, or keep the allowlist? (D-021)
- Set `narrationText` when scenes are created for EDUCATIONAL projects?
- End card: fail-closed or best-effort when it can't render?

## Code differs from a decision (verified 2026-10-16 @ `46dbf0c`)

- **Code differs — D-001:** the model registry still exposes non-FLUX2/H3/VEED models. `enum GenerationModel` (`schema.prisma`) still contains `NANO_BANANA, GROK_IMAGINE, LTX2, WAN_25, KLING, KLING_I2V, KLING_R2V, HIGGSFIELD, VEO3, FLUX, HUNYUAN_VIDEO, COG_VIDEO_X, SEEDANCE` (plus `FLUX2, FLUX2_EDIT, H3_MAX, VEED_FABRIC`), and `MODEL_META` still defines several of them. Retirement not yet implemented (as stated).
- **Code differs — D-020:** `Math.max(effectiveBlueprint.beats.length, 6)` is **still present** (`packages/api/src/routers/story.ts:4794`) as the fallback for `storyLength=null`, and the fixed 5 s duration fallback (`?? 5`) is still present in the scene-video duration expression. The tier limits and `ceil(words/2)+2` clamp themselves are implemented (`storyIntelligence/types.ts:213-214`, `storyPaceHelpers.ts:23-26`).
- **Code differs — D-030 (RESOLVED):** the educational `PRECONDITION_FAILED` gate is gone (PR B). Export now uses narration only when every scene has it and otherwise falls back to clip audio; partial narration shows a warning in the export UI. Option (b) — keeping existing cues and filling gaps — remains a follow-up.
- **Code differs — D-031 (RESOLVED):** closed by PR #60 `41eb27b`. The caps are now inserted at the output section and wired into `runFfmpeg` as a single choke point, `-shortest` is gone from the audio mux (it takes the canonical runtime with an explicit `-t`), and probe spawns are bounded by `FFMPEG_PROBE_TIMEOUT_MS`. The **one-export-at-a-time** guard is the only part still unimplemented — it ships with D-033 as an advisory lock.
- **Code differs — D-032:** the timeout path now marks the row `FAILED` (PR #60). Still missing: a crash-recovery sweep for rows left `GENERATING` when the process dies mid-render — deferred to D-033's worker startup sweep.
- **Code differs — D-040 (config, not code):** `VIDEO_PER_SECOND_PRICING` is set in `/root/raivstream/.env` but **not** in `apps/web/.env.local`, so the running web process does not see it (`pm2 env 0` has no such var). The flag is effectively **off** in production even though the rates are seeded.
