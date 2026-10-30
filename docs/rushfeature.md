# Rush feature roadmap

**North star:** a Raivstream production is a staged document where the unit is a **shot with
revision history**, continuity is carried by **named reference assets** rather than
re-described text, and **regenerating one shot does not fork the rest of the film**.

## What Rush's promise actually is

From the inspected bundle: Story → Treatment → Outline → Script → Scene breakdown → Cast →
Look → Coverage → Storyboard → live, with:

- explicit **per-stage approval**;
- shots as **revisioned takes**;
- **ordered reference-image tokens** for continuity;
- a **scope-aware director** (Rewrite the screenplay / Direct Scene 12 / Direct Shot 12C /
  Update Bible).

Auto mode (one sentence → film) is the on-ramp; Manual mode (bring your script) is the
professional path.

---

## Phase 0 — Baseline proof

Close the one unexercised path and confirm the current pipeline is trustworthy before
layering on it.

- [ ] **R16/KIDS acceptance render** — export → publish → moderation → feed. The only path
      never exercised. The KIDS story (`cmvsmkojj…`, "Justice League's Snack Adventure") is
      complete at 9 scenes; no scene has clips yet, so this needs ~9 clip renders (~720
      credits) before the export can exist.
- [x] **Admin-transition audit** (read-only, 2026-10-30) — one admin write site
      (`admin.moderateVideo`, `admin.ts:1464`); **no third instance** of the
      "sets one axis, forgets the paired one" class. `reject` intentionally leaves
      `isPublic` true (the filter is the gate) — commented. `flag` intentionally leaves
      `status` untouched — commented. No admin takedown path exists (see Future plans).

**Exit criteria:** both surfaces (GENERAL and R16) proven end-to-end; the admin-transition
class closed or documented with no third instance. *(GENERAL proven; R16 outstanding.)*

---

## Phase 1 — Identity store (the highest-leverage gap)

Replace `lockedIdentityBlock` text with named, typed, reusable reference assets — Rush's
Bible + Higgsfield's Reference Elements v2 in one shape.

- New `CharacterReference` entity: `category` (character | environment | prop), `name`,
  `displayName`, `medias[]` (front/side/full/wardrobe variants), `properties[]`
  (typed `text | multi_select`), `reviewStatus`, `ipDetected`, `usageMeta`
  (`generationCount`, `lastUsedAt`, `lastJobId`).
- Ownership split (user vs performer) so licensing can attach later.
- Track D's `fal-ai/flux-2/edit` becomes the renderer; the reference array becomes the input.

**Hard rule:** a character shot whose reference is required and missing is **refused**, not
generated from text.

**Exit criteria:** a character is created once, reused across scenes, and every generated
shot carries the ordered reference IDs it consumed.

---

## Phase 2 — Take model (the architectural change)

Make a scene's video a **take with a revision**, so regenerating one shot does not
invalidate the whole film.

- `StorySceneAsset` gains `revision`, `takeNumber`, `parentTakeId`.
- Export references **specific asset IDs per scene**, not a whole-film hash only.
- `regenerate-take` semantics: idempotency key + expected revision + typed conflicts
  (`REGENERATION_PENDING`, `REGENERATION_CONFLICT`), so a regenerate is safe to retry and
  never forks the film.
- Incremental assembly: the concat splices one scene's new take rather than re-rendering all
  six (PR #159's `[export.concat]` instrumentation is the seam; per-shot
  `segments/shot-NNN.mp4` R2 persistence, if added, makes this tractable).

**Exit criteria:** change scene 3 → export re-renders only scene 3's segment and re-assembles;
scenes 1–2, 4–6 keep their takes.

---

## Phase 3 — Staged production surface (expose what exists)

The 5.0 creative layer already has Brief → Bible → Plan → Preview → Produce → Review →
Director → Approval → Outputs. Surface it.

- Port the 5.0 stages onto the Story Playground surface, **or** flip the `RAIVSTREAM_5_*`
  flags and route `/create` canonical — whichever the acceptance evidence supports.
- Per-stage explicit approval (`script/approve`, `scenes/approve`, `takes/approve`) modelled
  on Rush's approval events.

**Exit criteria:** a creator sees and approves each stage; the linear Story Playground remains
as the Auto-path entry.

---

## Phase 4 — Scoped director

One conversational interface over script, scene, shot, and bible — scope-aware.

- Reuse 5.0's `director.propose` / `applyInstruction` / `affectedSceneIds`; add explicit scope
  targeting (Direct Scene 12, Direct Shot 12C, Update Bible).
- Cost estimate before apply (Rush has `/estimate`).

**Depends on Phase 2** — a scope-aware director over a whole-film hash just triggers full
re-renders with extra steps.

**Exit criteria:** "direct shot 12C" regenerates only that shot's take.

---

## Phase 5 — Cinematic vocabulary and look

- Lens/sensor/grade fields on director controls: lens (e.g. anamorphic 40 mm), sensor,
  movement, lighting, grade.
- Resolution ladder (480p → 4K) with plan gating, mirroring the existing credit-rate
  mechanism.

**Exit criteria:** a "look" is a saved, reusable object, not a prompt fragment.

---

## Phase 6 — Presets and LoRAs as product objects

- `ProductionPreset` with `variantId` and a strength control; selectable per generation.
- Shareable presets (Rush's `genjutsu_preset` pattern).

**Exit criteria:** a saved look can be applied, shared, and reused across productions.

---

## Phase 7 — Auto mode (the on-ramp)

One sentence → the existing pipeline, no questions, defaults, capped — Rush's Free-tier
promise.

- Skip `generateQuestions`, use defaults, run through to export; cap credits per film.

**Exit criteria:** "make me a 30-second noir short about a lost dog" produces a publishable
film without a single follow-up question.

---

## Phase 8 — Motion/object operator *(optional capability)*

A different operator class from I2V:

- **motion-control** — keep the source performance, re-render the subject;
- **replace-objects** — re-synthesise a masked region.

Pick one provider (Higgsfield Genjutsu if callable, or the Kling motion-control endpoints
exposed alongside). Mode-dependent reference budgets.

**Exit criteria:** a source clip + reference images produces either a motion-transferred or
object-swapped output.

---

## Phase 9 — Academy content tied to the surface

Academy exists (courses, lessons, assignments, submissions). Write the curriculum against
Phases 1–5 — building an actor, continuity that holds, choosing a camera and lens, taking over
the edit.

**Exit criteria:** 12 lessons / 4 modules, each tied to a shipped control.

---

## Future plans *(not scheduled, recorded so they are not lost)*

- **Series as first-class surface** — canon/memory/episodes exist in 5.0 but are flagged off; a
  series is a production with inherited continuity.
- **Studio/brand layer** — products/campaigns exist in 5.0; surface for commercial work.
- **Admin takedown (reversible, non-moderation)** — *named, not built.* An admin can **reject**
  (block + require re-review) but cannot **withdraw** another creator's video. Reject is the
  stronger action and already hides content, so this is not "admins can't hide a video"; the
  gap is a reversible hide for a copyright complaint, a harassment report pending review, or an
  author request — `admin.takedownVideo` writing `withdrawnAt` plus an
  `adminWithdrawnBy`/`adminWithdrawnReason` audit field, reversible without a full re-review.
  A product/policy decision (who, what reasons, how appealed), not a defect.
- **Pricing model decision** — Rush's pass-through (credits with per-second cost) vs
  Raivstream's configurable credit ledger. A business decision, not a feature; **do not change
  pricing while Phases 1–3 are in flight.**
- **Human-in-the-loop tier** — Rush's Pro Studio offers director prompt optimisation as a
  service; Raivstream has admin moderation, not a premium human service.
- **Provider breadth** — Raivstream owns its integrations (FLUX2, H3, ElevenLabs); adding
  Seedance/Kling/Veo/Sora is ongoing work, not a roadmap phase.
- **Second moderation pass over the assembled film** — deferred by policy; revisit only if a
  concatenation can read wrong in sequence.

---

## Ordering rationale

- **Phase 0 first** because the export loop's last unexercised path is the surface the whole
  roadmap claims to improve.
- **Phase 1 before Phase 2** because a take model without a reference store produces revisioned
  takes of inconsistent characters.
- **Phase 2 before Phase 3/4** because staged production and scoped direction are only
  meaningful if a shot is an addressable, revisioned unit.
- **Phase 3 before Phase 4** because the director needs a staged surface to direct.
- **Phases 5–7 in any order after 2** — independent polish and on-ramp.
- **Phase 8 optional** — a new capability, not a gap in Rush's promise.
- **Phase 9 last** — curriculum follows surface.

---

## Two reads required before Phase 1/2 can be scoped as work

1. **Track D's current shape** — is the reference already stored as an asset with an ID, or only
   as `lockedIdentityBlock` text? Decides whether Phase 1 is "add a table" or "promote an
   existing field."
2. **Export incrementality** — can the concat splice one scene's new take, or only re-render the
   whole film? Decides whether Phase 2 is weeks or a month.

Both are reads, not estimates. Do not scope Phase 1 or 2 as work until they are done.
