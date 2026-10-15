# Next Features — Product Specs

Four specs queued for design and implementation. Status tracked in `docs/roadmap/feature-tracker.md`.

---

## R16-STYLE-LOCK — R16 generation-time style enforcement

**Status:** DEPLOYED (PR #42)

**Problem:** R16/KIDS projects could reach generation with a non-R16-approved visual style (REALISTIC, WATERCOLOR, etc.) if the style was set before the KIDS audience mode was applied or via a stale UI state.

**Solution:** `enforceR16Style()` in `packages/api/src/routers/story.ts` remaps any non-`{CARTOON, THREE_D_ANIMATED, ANIME}` style to CARTOON at generation time when `audienceMode === 'KIDS'`. Write-path schema validation unchanged. All callers of `generateScenes` and scene-shot generation pass through this remap.

**Scope:**
- `packages/api/src/routers/story.ts` — `enforceR16Style()` + call sites
- Unit: `packages/api/src/routers/__tests__/r16StyleLock.test.ts`

---

## STORY-PACE — Story length and pacing system

**Status:** PROPOSED

**Problem:** Short stories get written long and then forced into ~6 fixed scenes, so scenes feel rushed. The writer, the scene planner, and the renderer all use different constants with no shared contract.

**Goal:** Length is chosen first, the story is written to that length, and scene count + per-scene duration come from the story's beats — not hardcoded constants.

**Design brief:**
- **Short / Medium / Long choice** — R16 default Short
  - Short ≈ 3–4 scenes, tight single-idea beats, one emotion per scene
  - Medium ≈ 5–7 scenes, richer arcs
  - Long = chapters (multi-chapter, future scope)
- **Write-to-budget** — the story writer receives the beat count and word budget up front (not post-processed)
- **One beat per scene** — scene count = narrative beats, not a constant 6
- **Per-scene duration from narration** — computed from narration length / action within provider limits (4–15 s), not always the max
- **Kids pacing** — one idea per scene, room for the emotion to land; never back-to-back action beats
- **Existing stories unchanged** — no backfill; new length choice defaults to Short for R16
- **Feature-flagged** — `STORY_PACE_ENABLED`; all work staged before production deploy
- **Credits unchanged** — scene count change affects batch generation cost; document the matrix

**Phase A (read-only — report and stop):**
1. Pipeline map (file:line) of where story length, scene count, and per-scene duration are currently decided
2. Baseline measurements on 8 representative ideas (word count, scene count, words/scene, seconds/scene, total runtime)
3. Proposed Short/Medium/Long numbers derived from baseline
4. Output: `docs/architecture/story-pace.md`

**Phase B (behind flag — staging first):**
- New `storyLength` enum on `StoryProject` + migration
- Writer prompt update (word budget + beat count passed in)
- Scene planner: scene count = beats from blueprint
- Export: per-scene `targetDurationSeconds` computed from narration length
- Tests: baseline regression + new length-budget tests

---

## MEDIA-LIB — Unified user media library

**Status:** PROPOSED

**Problem:** Users have no central place to view, manage, or share the media they've generated (images, scene videos, story exports, movies). R16 has no library at all today.

**Goal:** A unified "My Library" view for all generated media with download, soft-delete, and moderated sharing.

**Design brief:**
- **Content types:** generated images (per scene still), scene videos, story exports (MP4), movies
- **Download:** owner-only signed R2 URL; never exposed to non-owners
- **Soft delete:** mark as deleted; published/shared items must be withdrawn first (cannot delete live public content)
- **Post to feed:** owner submits → existing moderation queue (PENDING → APPROVED → published)
- **R16 FIRST:** R16 has no library today — highest priority
  - Route: `/library` on R16 subdomain
  - Kid-safe wording: "My Pictures", "My Videos", "Share with everyone" (= P4A submit flow), "Waiting for a grown-up to check"
  - Share → moderator approves + marks kids-safe → R16 kids feed only
  - **Never** the main feed from R16
- **Existing moderation queue reused** — no new approval pipeline

**Phase A (inventory + design, then stop):**
1. Inventory of existing media storage: R2 paths, ownership tables, how `storyVideoExport`, scene images, and movies are stored
2. Check what a "library" query looks like (latency, index coverage)
3. Design: data model additions, API surface, R16 route + wording
4. Output: design doc (location TBD)

---

## ADMIN-INSIGHTS — Per-user admin insights

**Status:** PROPOSED

**Problem:** Admins have no single-user view; they can see aggregate job stats but not per-user credit spend, media generation history, or engagement metrics. No CSV export exists.

**Goal:** A per-user detail page in the admin panel showing the full picture, exportable to CSV.

**Design brief:**
- **Fields:** credit spend (lifetime + last 30d), credit purchases + amounts paid (currency labelled), media generated by type (images/videos/exports/movies), videos posted, likes received, followers, plan, last active
- **Pages:** sortable users table + user detail page
- **Export:** CSV of users table (current filter applied)
- **Access:** `adminProcedure` only — never exposed to non-admin roles
- **Privacy:** no card numbers, no raw IPs

**Phase A (data inventory + design, then stop):**
1. Confirm likes/follows tables exist and are indexed; run `EXPLAIN` timings on candidate queries
2. Confirm credit purchase records have currency labels
3. Design: API surface (`admin.getUserInsights`), table schema, CSV shape
4. Output: design doc (location TBD)
