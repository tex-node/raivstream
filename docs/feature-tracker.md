# Raivstream — Feature Tracker

The single source of truth for what's implemented, tested, qualified, and deployed.
Update one row per feature per status change. Never conflate the four states.

## Status legend

| Status | Meaning |
|---|---|
| **IDEA** | Proposed, no design work started |
| **DESIGNED** | Design doc or ADR exists; no code |
| **IMPLEMENTED** | Code committed on a branch |
| **TESTED** | Unit + integration tests green in CI |
| **STAGING-QUALIFIED** | Exercised end-to-end against a real staging environment |
| **DEPLOYED** | Live in production, verified healthy |

**Rule:** a feature is never "done" until its row reads DEPLOYED with a commit SHA in the Notes column.

> **Statuses are not interchangeable.** TESTS PASSING ≠ PR MERGEABLE ≠ RELEASE AUTHORIZED.
> Track A and Track B are both **DEPLOYED** to production. The upgrade plan is fully deployed
> and the 2026-10-13 incident is reconciled (Open decisions #1 and #2, both resolved).

## Current release tracks

| Track | Contents | Status |
|---|---|---|
| **A — Upgrade (Phase 0–4)** | `feat/raivstream-upgrade`, PR #4 | **DEPLOYED** (`6057bdf`; incident reconciliation `542939e`) |
| **B — R16 A/B/C** | R16 video audio pipeline | **DEPLOYED** (`a4f46a3`) |
| **C — Admin observability** | Per-user drill-down (extends PL-01) | **PROPOSED** — not started |
| **D — Character consistency** | Multi-view canon, locked identity block, R2V | **PROPOSED** — not started (Layer 3 R2V is provider-available on fal) |

---

## Track B — R16 video audio (DEPLOYED)

Merged 2026-10-13 as PR #2. Production HEAD `a4f46a3`, healthy.

> Note: Track B was merged via a rebased/cherry-picked branch, so its commits on `main`
> are `fb332b8`, `24db068`, `b0e5c91`, `1f3a810` (merged at `a4f46a3`). Any reference to the
> pre-rebuild SHAs (`c188f76`, `433f0aa`, `9d8ca17`, `25d7ee9`) should be read as those.

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Narration script generation + moderation | DEPLOYED | `fb332b8` | `narrationScript.test.ts` | `a4f46a3` |
| Background music (Lyria, fail-closed) | DEPLOYED | `b0e5c91` | integration tests | `a4f46a3` |
| FFmpeg audio mux + export threading | DEPLOYED | `24db068` | integration tests | `a4f46a3` |
| Narration recovery fix | DEPLOYED | `1f3a810` | `narrationScript.test.ts` | `a4f46a3` |
| Migrations `20261009120000` + `20261009130000` | DEPLOYED | 2026-10-13 | `_prisma_migrations` rows | prod |

---

## Track A — Upgrade (Phase 0–4)

Branch `feat/raivstream-upgrade`, PR #4 — **DEPLOYED** (`6057bdf`). Migrations applied on prod;
the `idempotencyKey` constraint was reconciled on 2026-10-13 (`542939e`).

### Phase 0 — Baseline audit

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Candidate + architecture verification report | DEPLOYED (docs) | `f64a412`, `0f20f76` | `docs/operations/phase-0-baseline-report.md` | committed |

### Phase 1 — Credits and usage accountability

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Idempotency keys on all credit call sites | DEPLOYED | `dce4352` | `creditIdempotencyCoverage.test.ts` | `6057bdf` |
| Director idempotency (client-supplied id) | DEPLOYED | `d5e2125`, `d9e56b6` | `directorIdempotency.test.ts` | `6057bdf` |
| Remaining direct writers keyed (webhook, admin, paystack) | DEPLOYED | `7c83c0c` | coverage gate | `6057bdf` |
| Music charge per-cue fix (under-charge bug) | DEPLOYED | `a56597b` | `musicChargeRace.test.ts` | `6057bdf` |
| R16 narration + background-music charge keying (rebase integration) | DEPLOYED | `67b743b` | `phase_r16_music.test.ts` §D + coverage gate | `6057bdf` |
| Admin usage dashboard (PL-01) | DEPLOYED | `98c22c7` | `creditReporting.test.ts` | `6057bdf` |
| Ledger backfill + NOT NULL migrations | DEPLOYED | `6feb6df` | `migration-runbook.md` | reconciled 2026-10-13 |
| NOT NULL enforce (reconcile) | DEPLOYED | `9f90438` | `542939e` | constraint enforced; `is_nullable = NO` |

**Accepted limitations:**
- 14 test/staging accounts carry pre-existing balance/ledger drift (documented, no remediation)
- Sentry not configured in production → incident detection via health + PM2 logs only
- Automated stuck-reservation recovery: deferred
- Browser/mobile runtime acceptance: pending

### Phase 2 — R16 creation reliability

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| R16-02 — Style restriction (Cartoon, Anime, 3D Animation) | **ACCEPTED** | `a3e004a` | `r16VisualStyle.test.ts` + prod: legacy styles outside the R16 set still stored/read (KIDS: `STORYBOOK_ILLUSTRATION` 8, `COMIC_BOOK` 2, `WATERCOLOR` 1) — read path `effectiveVisualStyle` (`story.ts:1623`) passes the stored value through unchanged; writes guarded by `assertR16VisualStyle` (`story.ts:3876`, `6439`, `7697`) + the `storyVisualStyleSchema` enum. **Write-path inventory (`StoryProject.visualStyle` writers):** `createSpark` (`story.ts:3890`, guarded ✓), `createProject` (`:7672`, guarded ✓ since `2032ae06`), `updateProject` (`:7708`, guarded ✓ change-only), `applyStylePreset` (`:6442`, guarded ✓); the chapter-edit path (`:4175`) re-writes the current value (no-op, no guard needed); other `storyProject.update` sites don't touch `visualStyle`. | `6057bdf` |
| R16-02-UX — legacy style shows a blank picker | **PROPOSED** | — | For a legacy-style R16 project the picker shows blank (the value isn't in `VISUAL_STYLE_OPTIONS`). Show the current style as a read-only label + prompt to pick a new one. Do not build now. | — |
| R16-05a — Chapter snapshot / edit / restore | **ACCEPTED** | `354f882` | `chapterVersioning.test.ts` + prod: project `cmv14z8t601fgx61oozrk0lnz` versions v1 EDIT 9509 → v2 EDIT 9004 → v3 MANUAL **9509** (restore = pre-edit body); **0 scene assets created in the restore window (2026-10-14 18:00–18:20)** → restore neither deletes nor regenerates scene assets | `6057bdf` |
| R16-05b — Affected-scene surfacing | **IMPLEMENTED** | `354f882` | `chapterVersioning.test.ts` covers `affectedSceneIdsForChapterEdit` (`chapterVersioning.ts:79`) — helper + unit test only; **not wired** into the router (`story.ts` imports only `snapshotChapterVersion`) → not returned/shown. **Gate: router + UI wiring** (approved: `updateChapter` + restore return `affectedSceneIds`; UI marks scenes "May be out of date" with a "Refresh picture" action; no auto-regeneration). | `6057bdf` |
| Phase 2 release evidence | DEPLOYED (docs) | `5b18aff` | `docs/operations/phase-2-release-evidence.md` | committed |

**Accepted limitations:**
- `affectedSceneIdsForChapterEdit` returns all scenes when mapping unavailable (conservative)
- Batch concurrency fixed at 2, no user override
- **Batch routing — verified correct (not a bypass).** The batch runs through `generateSceneImageAsset` (via `batchDepsFor`, `story.ts:285-290`), so it uses the same `computeSceneImageRouting` decision as the single-scene path (FLUX2_EDIT + `deterministicSeed(sceneId)` when approved refs exist and the capability is live; plain FLUX2 otherwise). The earlier observation that the batch "used plain FLUX2" was a project-scope confusion: the batch ran in `cmv8feun40013t9d9ld7ul2rs`, which has **zero approved character references** — plain FLUX2 was the correct output. No code change required.
- R16-03 allows "use draft" without approval (by design)

### Phase 3 — Branded video output

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Two-second end card in `renderOutputDerivative` | DEPLOYED | `14ee523` | `endCard.test.ts` + `pnpm verify:end-card` PASS on VPS | `6057bdf` |
| Preflight (drawtext/font) + verification script | DEPLOYED | `e4937ce` | verify script | `6057bdf` |

**Verified:** `ffmpeg 6.1.1-3ubuntu5`; 8.02s output, h264 1080×1920 + aac.
**Scope:** end card rides the render pipeline only. Direct uploads do not carry it (Option A — accepted).

### Phase 4 — Publishing and sharing

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Publication lifecycle (submit/withdraw/resubmit) | DEPLOYED | `ca2d84f` | `publication.test.ts` | `6057bdf` |
| Feed `withdrawnAt` filter + `getById` tightening | DEPLOYED | `ca2d84f` | `publication.test.ts` | `6057bdf` |
| Share link model + attribution | DEPLOYED | `1d2bb4e`, `ee8a4ca` | `shareLinks.test.ts` | `6057bdf` |
| Retention (90-day aggregate) | DEPLOYED | `ee8a4ca` | `shareAttributionRetention.test.ts` | `6057bdf` |
| Share menu (WhatsApp, Instagram, copy, native) | DEPLOYED | `4027580` | `shareTargets.test.ts` | `6057bdf` |
| Phase 4 design doc | DEPLOYED (docs) | `ed5343c` | `docs/architecture/phase-4-publication-sharing.md` | committed |
| Phase 4 release evidence | DEPLOYED (docs) | `6cea587` | `docs/operations/phase-4-release-evidence.md` | committed |

**Scope:** R16-only; APPROVED-only sharing; per-click attribution; retention 90d rolling.
**Accepted limitations:** end card absent on direct uploads; retention aggregation manual; native share best-effort.

### Infrastructure / process

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Migration pre-flight runbook (Checks A–G + C-1) | DEPLOYED (docs) | `d85a6f6`, `a0039c5` | `docs/operations/migration-runbook.md` | committed |
| Integration count guard (`>=14`) | DEPLOYED | `24f798f` | CI green (`38412188638`) | main |
| Upgrade closing status | DEPLOYED (docs) | `096b5d0` | `docs/operations/upgrade-plan-closing-status.md` | committed |

---

## Track C — Admin per-user observability (PROPOSED)

Extends PL-01 from aggregate usage reporting to per-user drill-down. Depends on Phase 1 credit
idempotency (ledger trustworthiness) — which is in PR #4. Does not depend on PR #4 shipping first,
but the ledger view will show the 14 test-account drift cases until those are resolved.

Today's PL-01 admin view is aggregate: totals across all users, one row per user in a list, no
click-through. This track adds the drill-down.

### C1 — Admin per-user summary panel

| Feature | Status | Notes |
|---|---|---|
| Per-user summary view | IDEA | Click a user in `/admin/users` → `/admin/users/[userId]`. Shows: current balance, lifetime credits consumed, media generation count (images / videos / audio broken out), total assets in library, account age, role, tier. |
| Data sources | — | `credit_balances`, `credit_transactions` (aggregated), `generation_jobs` (count by type), `story_scene_assets`, `audio_assets`, `videos` |
| API | — | New `admin.getUserSummary({ userId })`, `adminProcedure`-gated |

### C2 — Admin per-user token history + media library

| Feature | Status | Notes |
|---|---|---|
| Token (credit) history tab | IDEA | Paginated `credit_transactions` for the selected user. Columns: timestamp, type (PURCHASE/USAGE/BONUS/REFUND/ADMIN_ADJUST), amount, featureKey, referenceId, balanceBefore, balanceAfter. Filters: date range, type, featureKey. Export CSV. |
| Media library tab | IDEA | Browsable list of every generated or uploaded asset for the user, with thumbnails. Union across: `StorySceneAsset` (IMAGE + VIDEO), `Video` (creator uploads), `AudioAsset` (narration + music). Columns: created, type, project, status, asset URL, generation job link. Filters: asset type, project, status, date range. |
| Drill-down linkage | IDEA | Each asset row links to the source `GenerationJob` (cost provenance) and the source project/scene. |
| API | — | `admin.getUserTokenHistory({ userId, cursor, filters })` and `admin.getUserMediaLibrary({ userId, cursor, filters })`, `adminProcedure`-gated, cursor-paginated |

### Track C — open questions

1. **Scope of "token usage."** Credits consumed (USAGE only), or total activity (purchases + grants + consumption)? Summary should show both, clearly separated.
2. **Media library asset ownership.** Uploads are `Video.creatorId`; generated assets live under `StorySceneAsset` (project → user); audio under `AudioAsset`. Confirm: does a project shared with a collaborator expose its assets in the collaborator's admin view, or only the project owner's?
3. **Retention vs. browsing.** Cap at N most recent, or paginate fully? Recommend paginate with a "showing latest 500" default.
4. **CSV export.** Needed for support workflows, or is on-screen enough? Cheaper now than after UI is built.

### Track C — effort estimate

- C1 (summary panel): ~1 day
- C2 (history + library tabs, API + UI): ~2–3 days
- Test coverage: ~0.5 day
- **Total: ~1 week**

### Track C — dependencies

- Phase 1 ledger must be complete (PR #4)
- 14-account drift cases will appear in the history tab; summary should exclude or clearly flag them (see Open decisions #5)

---

## Track D — Character consistency (PROPOSED)

**Current pipeline:** story → scene seeds → FLUX2 starting frame → MiniMax H3 image-to-video. Identity is anchored by one still and by LLM-paraphrased text.

**The problem:** characters drift and morph — expected for I2V from a single frame (any variation in that frame or the prompt propagates). No reference mode, no multi-view anchor, no locked identity block.

**Impact:** three pipeline points — pre-production (character canon), prompt composition (`visualBible.ts`), and the generation adapter (H3 I2V → R2V).

> **Investigation (2026-10-13, read-only).** The deployed adapter `minimax/h3-max-turbo/image-to-video` (`packages/api/src/lib/mediaProviders/fal/contracts.ts:71`, `H3_MAX_I2V_CONTRACT`) is **image-to-video only** — fields `prompt`, `image_url`, `end_image_url`, `duration`, `resolution`, `mode`, `seed`, `prompt_expansion`; **no reference/multi-reference mode**. However fal exposes **`minimax/h3-max/reference-to-video`** (and `minimax/h3/reference-to-video`) — "up to 9 subject/style reference images … cited in the prompt by order (Image 1, Image 2 …)", input `reference_image_urls`. So **Layer 3 R2V is provider-available, not blocked** — it needs a new endpoint adapter plus the ordered-reference prompt convention. For canon images, FLUX.2 offers **multi-reference editing** (`fal-ai/flux-2/edit`, ≤10 refs via `@image1 …`) and **FLUX.2 LoRA training**; there is **no dedicated "CharacterSheet"/"TripleView" endpoint** — multi-view needs one of those mechanisms.

### Layer 1 — Character canon

| Feature | Status | Notes |
|---|---|---|
| Multi-view character sheet | IDEA | Front/side/back from a single portrait. [capability pending: no dedicated CharacterSheet endpoint — use `fal-ai/flux-2/edit` multi-reference (≤10 imgs) or a trained FLUX.2 character LoRA; multi-prompt generation is the fallback]. |
| Freeze the canonical reference | IDEA | **Extends R16-03.** `StoryCharacterMemory.approvedReferenceAssetId` + `approvedAt` (`schema.prisma:1289`) already point at ONE `CharacterReferenceAsset` (`schema.prisma:1312`). Add immutability (currently `isLatest` lets assets be superseded). |
| Immutable character bible | IDEA | `applyMasterVisualBible` (`visualBible.ts:43`) already injects `bible.characters` verbatim as `Character <name>: <description>` (`:76–83`); immutability is a data/authoring change, not a new prompt mechanism. |

### Layer 2 — Prompt: no reinterpretation

| Feature | Status | Notes |
|---|---|---|
| Locked identity block | **IMPLEMENTED** (branch `feat/track-d-locked-identity`) | Name-based placeholders: `renderPlaceholders` sends `{{CHARACTER_<NAME>_IDENTITY}}` to the enhancer (it cannot paraphrase what it cannot see), `substituteIdentityBlocks` replaces them after `enhance()` with the resolved block — `lockedIdentityBlock` verbatim, else today's composer output (byte-compatible). Schema: `StoryCharacterMemory.lockedIdentityBlock` / `identityFrozenAt` / `immutableDetails`. Procedures: `previewCharacterIdentity` / `lockCharacterIdentity` / `unlockCharacterIdentity`. UI: `CharacterDetailScreen` lock/preview/unlock + badge. |
| D — video manifest prompt bypasses identity locking | **FOLLOW-UP** | `story.ts` (video path) overrides `composed.prompt` with the persisted manifest's `minimax_video_prompt` (raw GPT-4o prose); only `applyMasterVisualBible` re-locks it. The Layer 2 placeholder substitution does **not** cover this path. Separate fix — discovered while implementing Layer 2. |
| D — V2 composer identity placeholders | **FOLLOW-UP** | `composeV2BasePrompt` (`story.ts:2258`) keeps its own `characterIdentity`; it is not placeholder-wired. Behind `VISUAL_PROMPT_COMPOSER_V2_ENABLED` (`visualPromptComposer/types.ts:221`) — **not set in production**, so the wired V1 path is live. Wire V2 the same way if the flag is ever enabled. |
| Reference-role tagging | IDEA | Needs the R2V ordered-reference convention: a role per `reference_image_urls[i]`, cited in-prompt as "Image N". [capability pending: per-image role semantics on `minimax/h3-max/reference-to-video`]. |
| MiniMax H3 six-section format | IDEA | `subject_definitions` (character → ordinal) + `retention_analysis`. [capability pending: verify the reference-to-video prompt schema accepts these sections — unverified]. |
| `applyMasterVisualBible` extension | IDEA | Extend to carry identity blocks + ordinals. Current signature: `applyMasterVisualBible({ prompt, negativePrompt?, bible?, sceneCharacters?, approvedReferences?, target }) → { prompt, negativePrompt }` (`visualBible.ts:43–56`). |

| Reference-conditioned scene images (flux-2/edit) | **DEPLOYED** (PR #18, `c7b81e0`) | **Track D Layer 1.** Scenes whose characters have approved references route to `fal-ai/flux-2/edit` (`image_urls` max 4) with a **deterministic seed** (`deterministicSeed(sceneId)`) and the **prompt enhancer skipped** so the composed prompt is byte-stable. Gate: `isFalCapabilityLive(config,'imageEdit')`. Provenance: `StorySceneAsset.rendererVersion = 'phase-d1-v1'`. **Determinism verified in production 2026-10-14:** two regenerations of the same scene produced identical `prompt_hash` (`1686abfa…`) and identical outputs; identity from the reference image, character detail (backpack) from the text description. Routing contract complete — the seed is now computed inside `computeSceneImageRouting` (`{ model, prompt, imageUrls, seed }`), PR #20 `8b20b46`. |
| D - flux-2/edit `guidance_scale` not tuned | **FOLLOW-UP** | `toFlux2EditInput` never sets `guidance_scale` (endpoint default 2.5). Leave at default unless future drift surfaces; the lever is `guidance_scale: 7.5`. |
| D - placeholder instruction not holding | **FOLLOW-UP** | `[identity] fallback appended` fires on every regeneration — the deterministic fallback does the work, so the placeholder mechanism is dead weight. Consider removing the placeholder path or tightening the enhancer instruction. |
| D - enhancer-spy tests (7-8) missing | **FOLLOW-UP** | FLUX2_EDIT-skips-the-enhancer and non-edit-runs-the-enhancer are not unit-tested; the production retest (identical `prompt_hash` across two regenerations) proves the skip end-to-end. Add spies on `promptEnhancerService.enhance` around `composeEnhancedScenePrompt`. |
| D - video seed ignored regenerated stills | **FIXED** (`fbbebc57`) | The I2V chain (Phase 17) always seeded scene N from scene N-1's last frame, so a regenerated still was never the video's opening frame. Fix: if a scene's latest READY IMAGE is newer than the previous scene's latest READY VIDEO, seed from the scene's own still (`chooseVideoSeedSource`, `videoSeedPolicy.ts`); chain preserved for straight-through generation. Evidence: `[videoSeed] source { sceneOrderIndex: 6, source: 'own-still', sceneStillAge: 2026-10-14T15:00:26Z, prevVideoAge: 2026-10-14T03:54:59Z }`; user confirmed the video opens on the regenerated still (scale + likeness). |

### Layer 3 — Pipeline: identity across shots

| Feature | Status | Notes |
|---|---|---|
| **R2V mode** | IDEA | Highest-impact change. **Not provider-blocked** — `minimax/h3-max/reference-to-video` exists on fal. Requires a new adapter + endpoint switch from the deployed I2V endpoint; `H3_MAX_I2V_CONTRACT` has no R2V path. |
| Last-frame → first-frame chaining | IDEA (partial) | **Already exists at scene level** — `chainLastFrameSeedImage` (`story.ts:386`) seeds shot N+1 with the previous scene's last frame via `extractLastFrameAsSeedImage` (`lastFrameExtract.ts:32`), falling back to the still. Extend to per-shot within a shot grid. |
| Per-character state store | IDEA | `{ canonical refs, identity block, current-appearance }` retrieved per shot. Canon already lives on `StoryCharacterMemory` + `CharacterReferenceAsset`; a per-shot resolver is new. |
| Movie Builder continuity check | IDEA | Verify each shot's opening frame matches the prior close within tolerance. New work in `movieRenderWorker.ts` (no existing check). |

### Track D — open questions (findings)

1. **R2V on the deployed endpoint?** The deployed `minimax/h3-max-turbo/image-to-video` is **I2V-only** (`contracts.ts:71`). R2V exists as a **separate** fal endpoint — `minimax/h3-max/reference-to-video` / `minimax/h3/reference-to-video` (up to 9 reference images). Upgrade path: **new adapter for the reference-to-video endpoint** (not blocked).
2. **FLUX2 CharacterSheet / TripleView on fal?** **No such named endpoint.** FLUX.2 supports multi-reference **editing** (`fal-ai/flux-2/edit`, ≤10 images, `@imageN`) and **LoRA training** (incl. "same object from different angles"). Multi-view canon is achievable via multi-reference edit or a character LoRA, not an existing adapter.
3. **Character sheet scope** — every named character, or ≥N scenes? **Open** (product decision).
4. **Existing projects** — backfill or new-only? **Open** (canon assets are immutable once frozen; backfill needs a migration path).
5. **Extend R16-03's model or add a new one?** **Extendable** — `CharacterReferenceAsset` (`schema.prisma:1312`) + `approvedReferenceAssetId` already model one approved reference; multi-view needs a view/role field or a sheet-level asset.

---

## E1 — Silent output on stitched exports (DEPLOYED)

| Item | Status | Notes |
|---|---|---|
| E1 — source clip audio dropped in stitched exports | **DEPLOYED** | Both audio-carrying paths fixed and verified live. **Export path** (`renderOutputDerivative`): PR #9 @ `c4ee530` — audible. **Movie Builder path** (`movieRenderWorker`): PR #11 @ `64e6e9d` — the native-audio push sat inside `if (sources.length > 0)`, so a project with no cues rendered silent; moved above the guard. Renderer versions: `EXPORT_RENDERER_VERSION = 'phase-3-v2'`, `MOVIE_RENDERER_VERSION = 'phase-16-v2'` (both folded into their hashes → cached silent outputs invalidated). Evidence: movie asset `metadata.hasAudio: true`, `audioVerification` non-null, file h264 + aac, mean −26.1 dB (max −2.6 dB); export re-render audible. |
| E1 — video-only music path does not append the end card | **FOLLOW-UP (low priority)** | Pre-existing bug, discovered 2026-10-13 while implementing E1 (the video-only + background-music path returns before `appendEndCard`). Not fixed in PR #9 — separate small fix. |
| E1a — auto-trigger narration for non-educational projects | **OPEN (product decision)** | Non-educational projects do not auto-generate narration. Whether they should is a product choice, not a bug. No code. |
| E1 — duplicated native-audio extraction (tech debt) | **FOLLOW-UP** | Audio extraction is duplicated: `extractNativeAudio` (`movieRenderWorker.ts`) and `extractNativeAudioBed` (`render.ts`). Consolidate into a shared utility when the next audio work happens — this duplication is the reason a single fix didn't cover both surfaces. |

**Cache invalidation:** `computeSourceHash` (`storyVideoExportService.ts`) = SHA-256 of `${EXPORT_RENDERER_VERSION}|sorted(sceneId:assetId[:audio:audioUrl])`, under `@@unique([projectId, sourceHash])`. The renderer version is now folded in (E1 requirement), so this renderer change invalidates every cached export — otherwise already-exported rows would be reused and stay silent.

---

## Product backlog (not started)

Ordered by leverage. Do not start more than one of these at a time.

| Feature | Status | Notes |
|---|---|---|
| World Builder (Phase 7A) | IDEA | Proposal only. Persistent locations, props, world rules, World→Story→Character→Scene DNA. Highest product differentiator. |
| Timeline Editor integration | IDEA | Sequence Workspace exists on `-phase9a` worktree. Reconcile before scoping new work. |
| Movie Builder production | IDEA | Exists on `-phase9b1-current` at `phase-9b1a-v2`. Not merged to main. |
| Scene transition generator (7D) | IDEA | Not started. Depends on Movie Builder. |
| Voice/narration for non-R16 | IDEA | R16 has narration; non-R16 story flow does not. |
| Phase 8 universe features | IDEA | Shared worlds, storybook collections. Depends on World Builder. |

---

## Branch hygiene (check monthly)

12 worktrees exist. Not all are active. Stale worktrees are where work silently diverges.

| Worktree | Branch | Last known state | Disposition |
|---|---|---|---|
| `raivstream` | `main` | `a4f46a3` | Active |
| `raivstream-upgrade` | `feat/raivstream-upgrade` | PR #4 (`67b743b`) | Active |
| `raivstream-ci6d` | (merged) | — | Archive/remove |
| `-phase9a` | Phase 9A sequence | `f2ed6b4` | Reconcile before Timeline work |
| `-phase9a-current` | Phase 9A | `3dadd70` | Superseded? Verify |
| `-phase9b1-current` | Movie Builder | `3dadd70` | Reconcile before Movie work |
| `-phase9b2-audio` | Audio layer | `f2dd60a` | Separate release; staging-qualified |
| `-ui-redesign` | UI | `4cf01ed` | Status unknown |
| `-prompt-quality` | Prompt quality | `f2ed6b4` | Status unknown |
| `-library-commit` | (detached) | `2517bce` | Investigate or remove |
| 2× `.claude/worktrees/*` | various | — | Ephemeral |

**Action:** classify each as ACTIVE / HOLD / ARCHIVE monthly. Delete ARCHIVE worktrees.

---

## Open decisions

| # | Decision | Blocks |
|---|---|---|
| 1 | Merge PR #4 in its window? | **RESOLVED** — merged (`6057bdf`) |
| 2 | When to add `20261013120000_..._enforce_not_null`? | **RESOLVED** — applied (`542939e`); constraint enforced |
| 3 | Is "skip end card on preflight failure" acceptable? | Phase 3 policy |
| 4 | Which product thread starts first — World Builder vs. Timeline/Movie Builder? | Product roadmap |
| 5 | Do the 14 drifted accounts need a seed-script fix? | Reconciliation integrity for future test accounts |
| 6 | Track C scope — build both C1 and C2, or C1 first? | Admin observability work |
| 7 | Token history retention — show all-time or rolling window? | Track C ledger view |

---

## Release acceptance checklist

For each release track, all must be true before declaring DEPLOYED:

- [ ] All feature rows read IMPLEMENTED or better
- [ ] CI green (unit + integration, real Postgres)
- [ ] Migrations classified additive vs. breaking; breaking ones applied post-code-deploy only
- [ ] Staging qualified (real media, real providers where applicable)
- [ ] Pre-flight runbook Checks A–G completed
- [ ] Production health observed ≥ 1 hour post-deploy
- [ ] Rollback plan documented

### Track A — checklist state (DEPLOYED)

- [x] All feature rows DEPLOYED
- [x] CI green — runs `38415105321` (PR #4) and `38429242486` (PR #5)
- [x] Type-check green (api + web); API suite 1665 passed / 5 skipped / 0 failed locally
- [x] Migrations applied on prod; `migrate status` up to date
- [x] Merge window authorized and executed — PR #4 (`6057bdf`)
- [x] Post-deploy health ≥ 1h observation — 4/4 samples healthy, 0 × `23502`
- [x] `20261013120000_..._enforce_not_null` applied — PR #5 (`542939e`); constraint enforced

---

## Last updated

2026-10-15 — **Defect fixed: R16 legacy-style trap** (`2032ae06`). `updateProject` guarded whenever `visualStyle` was present in the payload; `story-studio/page.tsx` re-sends the current style on every save (seeded from `project.visualStyle`) → an existing R16 project with a pre-restriction style (`STORYBOOK_ILLUSTRATION` / `COMIC_BOOK` / `WATERCOLOR`) could not be saved. Fix: guard only on a **changed** value (incoming ≠ stored); reads/generation untouched (no generation path calls `assertR16VisualStyle`). 4 regression cases added to `r16VisualStyle.test.ts` (21 pass). **Data-cleanup flag (do not touch now):** 2 GENERAL projects store **raw strings** as `visualStyle` — one a full Afrofuturist prompt, one `3D Animated` — left as-is. **git quirk resolved:** the `git pull --ff-only` "Aborting … no such ref was fetched" was a transient fetch failure masked by output truncation; config is correct (`branch.main.merge = refs/heads/main`, `remote.origin.fetch = +refs/heads/*:refs/remotes/origin/*`) — stop masking fetch output.

2026-10-15 — **R16-02 → ACCEPTED; R16-05 split into 05a/05b.** R16-02: legacy styles outside the R16 set are still stored/read in prod (KIDS `STORYBOOK_ILLUSTRATION` 8, `COMIC_BOOK` 2, `WATERCOLOR` 1; plus GENERAL `PHOTOREALISTIC`/`CINEMATIC_FANTASY`/`AFRICAN_FOLKTALE_ILLUSTRATION` and two raw-string legacy values); read path `effectiveVisualStyle` (`story.ts:1623`) passes the stored value through unchanged; writes guarded by `assertR16VisualStyle` (`3876`/`6439`/`7697`) + the `storyVisualStyleSchema` enum (`r16VisualStyle.test.ts`). **R16-05 split:** **05a** (snapshot/edit/restore) → **ACCEPTED** (unchanged evidence); **05b** (affected-scene surfacing) → **IMPLEMENTED** — helper + unit test only, not wired; gate = router + UI wiring (approved; build after Slice F).

2026-10-15 — **Slice B gap closed + R16-05 → ACCEPTED.** "Reused across regeneration" proven in prod: scene `cmv156v6v01max61ob18tqyr6` (ord 4) has **4** `fal-ai/flux-2/edit` IMAGE versions (`isLatest` f,f,f,t) and scene `cmv156v6v01mex61o14x5qhkq` (ord 6) has **3** (f,f,t) — both with the approved chars Pip + Sneaky Hopper. **R16-05 → ACCEPTED**: versions v1 EDIT 9509 → v2 EDIT 9004 → v3 MANUAL 9509 (restore == pre-edit body); **0 scene assets created in the restore window** (2026-10-14 18:00–18:20) → restore neither deletes nor regenerates assets. **Gap (product decision):** `affectedSceneIdsForChapterEdit` is defined + unit-tested but not wired into the router → affected-scene identification is not surfaced.

2026-10-15 — **R16-03 → ACCEPTED** (reference-conditioned continuity verified in prod: project `cmv14z8t601fgx61oozrk0lnz`, scenes ord 4 + 6 route to `fal-ai/flux-2/edit`/`phase-d1-v1` with the approved chars Pip + Sneaky Hopper; refs reused across scenes + regeneration). **Slice A pending-deploy audit (read-only):** repo migrations **62 == prod `_prisma_migrations` applied 62** (parity checked 2026-10-15); R16-EXPORT `20260925180000_story_video_export`, EDU-B `20260926120000_educational_contract`, R16-AUDIO `20261009120000` + `20261009130000` are **all applied in prod** and the live schema matches → **DEPLOYED** (next gate = real-use acceptance: R16-EXPORT needs a Phase 2H real export → Watch Story; R16-AUDIO needs the `story:speech_generation` rate + ELEVENLABS/LYRIA flags set in prod env). **P1 credits → DEPLOYED**: contract phase applied (`20261012140000` + `20261013120000`); `credit_transactions.idempotencyKey` NOT NULL confirmed in the live schema.

2026-10-15 — **R16-04 → ACCEPTED** (promoted from DEPLOYED). Acceptance verified against prod data (run `cmv8gevl40036t9d91ctcu4g9` COMPLETED, 6/6 items READY, `costUsedCredits` 480 = 6 × 80, ledger matches); batch routing verified to reuse `generateSceneImageAsset`/`computeSceneImageRouting` (no bypass — the earlier "plain FLUX2" observation was a zero-reference project); router-level wiring coverage added (`batchRoutingWiring.test.ts`; `batchDepsFor` exported as a named export, no behavior change); batch UI terminal-state fix `7c4f63aa`. `main` = `044af63`; VPS in sync.

2026-10-14 — video-seed override deployed (`fbbebc57`); user confirmed the regenerated video opens on the correct still. Multi-character drift was a wrong-seed symptom, not H3 weakness — R2V adapter not required.

2026-10-14 — **Track D closed; both layers deployed and verified.** Layer 2 (locked identity block,
`9526929`) and Layer 1 (reference-conditioned scene stills via `fal-ai/flux-2/edit`, `c7b81e0`) are
live; determinism verified in production (two regenerations produced identical `prompt_hash` and
identical outputs). Routing contract completed (PR #20 `8b20b46`). Multi-view sheets deferred
(Option D); R2V validated viable but not required. Follow-ups listed above, none blocking.

2026-10-13 — Upgrade plan **fully deployed**. PR #4 merged (`6057bdf`); PR #5 reconciliation merged
(`542939e`) re-enforcing `credit_transactions.idempotencyKey` NOT NULL. Live verification: 16 keyed
charges pre-constraint + keyed charges post-constraint; 0 × `23502`. The 2026-10-13 incident is
**reconciled**. Track C (admin per-user observability) and Track D (character consistency) remain
proposed, not started.

### SHA map (pre-rebase → post-rebase) and verification basis

Patch-id-verified (exact content match): `656261c→d5e2125`, `f25ebde→d9e56b6`, `0e29fb4→f64a412`,
`50fdca8→0f20f76`, `682202c→a3e004a`, `fb15410→ee8a4ca`.

Amended during conflict resolution (map by subject + position; patch-id differs as expected):
`4814748→dce4352` (story.ts import union), `ef6f8d8→14ee523` (render.ts/storyVideoExport union),
`a91881b→e4937ce` (render.ts union).

Subject-matched (distinctive subjects): `b9081e9→7c83c0c`, `c8f4adb→a56597b`, `3911c14→98c22c7`,
`c4bc985→6feb6df`, `e42dcf8→e9d47ec`, `ba445e3→8fe7df7`, `38b3964→5e3dfb5`, `6f9447c→324abc0`,
`33ff9fc→915c7be`, `232143b→2145173`, `5ef5933→354f882`, `7c2b443→5b18aff`, `009b739→ca2d84f`,
`5c672a1→1d2bb4e`, `befc3c5→4027580`, `7c7d890→ed5343c`, `bbab56e→6cea587`, `dde0e00→096b5d0`,
`c4b3592→d85a6f6`, `3a827d9→a0039c5`, `dc8f083→24f798f`.

**Unresolved:** none outstanding. Track B's pre-rebuild SHAs (`c188f76`, `433f0aa`, `9d8ca17`,
`25d7ee9`) are superseded by `fb332b8`/`24db068`/`b0e5c91`/`1f3a810` on `main`.

E1 closed 2026-10-13 — both audio-carrying paths (export `c4ee530`, Movie Builder `64e6e9d`) verified audible.

Next review: **Track C scoping** (admin per-user observability) — Track D is closed. Backlog: the Track D follow-ups above (all low-priority, none blocking).
