# Creative Identity Arc — Close (2026-11-03)

## Capability, measured

| measure | value |
|---|---|
| identity at the start of the arc | **0–50** (reference-less, full-body) |
| identity after framing + references | **median 70**, with **80–90** where conditioning and framing land well |
| best measured scene | **90** (take 2, cmvyapup SCENE_03, 4 references, `framingInPrompt=true`) |
| un-conditioned control | **80** (cmvylvaz, framing only, zero references) |
| conditioned takes | 90, 80, 70, 70, 70, 70, 60 |

Conditioning is proven end to end: the framing phrase is confirmed **in the provider payload** (`[creative.framing] framingInPrompt=true`), not merely composed.

## The floor decision

**Floor 75 stands.** Roughly **3 of 7 measured beats clear it.** The consequence is recorded rather than softened: **most creative output will be flagged by design.** Lowering the floor to 70 would have admitted the pipeline's median instead of its good work, and a gate that passes everything it produces is not a quality bar.

## The take model

Live, chargeable, loud on failure. A take creates a **new row** at `max+1` with `parentTakeId`, renders with the project's current approved references and framing, **charges on its own key** (verified `CreditTransaction -80` per take), and **demotes the previous take** (`isLatest=false`) rather than deleting it. `assertNotResetAfterCharge` still refuses the reset route — the guard now points at a capability that exists.

## The silent-zero class

One helper, `chargeOrThrow()`, makes a charge failure impossible to read as a zero on the newest path: it writes the transaction or throws. **One tolerant site remains** — `runner.ts:202` — annotated in code with its follow-up, because switching it breaks 26 runner tests that mock a client with no rate row. That is a test-contract migration, not a one-liner.

Three defects shared this shape: `castReferences` returning `created=0`, `resubmitPublication` reporting success while changing nothing, and `createNewTake` reporting `creditsCharged=0`. Two of the three are now impossible; the third is documented.

## The residue, named

| category | count |
|---|---|
| cleared and resolved | 4 flags |
| below floor, conditioned takes measured | 5 scenes |
| thin input / no cast (deferred) | 7 projects |
| out-of-scope (non-narrative), audit kept | 73 flags |
| accepted loss (no recoverable intent) | 2 projects |

Live flags: **22**, and the count is accurate — the resolution pass asserts `RESOLUTION_EXPECTED_BUT_CLEARED_ZERO` rather than reporting a silent zero.

## Infrastructure debts discovered

1. **Creative tables are owned by `supabase_admin`.** The deploy's `postgres` migration step cannot alter them; the failure reads as a skipped runner.
2. **The take model's unique constraint must include `projectId`** — `sceneId` alone collides across projects.
3. **Branch ruleset `main-required-checks` requires checks on the current head.** A stale base produces `2 of 2 required status checks are expected` even when every check on the old head passed. `gh pr update-branch` is the fix — not a re-push, and not a workflow change.
4. **`runner.ts:202`** still swallows a charge failure; it is the last of its class and needs the mock contract migrated.

## Deferred, with shape

| item | shape |
|---|---|
| thin-input projects (7) | better creator input, not a pipeline fix |
| video re-render | deferred by the backlog decision; discontinuity trade-off recorded |
| disclosure | film page reads `sourceProjectId` → minimum identity |
| planner persistence | `explicit.durationSeconds` captured at intent, lost at plan |
| eight acknowledged failure lines | shrink-only set, test-enforced |
| ledger writer | blocked on a revenue pool |
| `runner.ts:202` | tolerant charge; needs a test-contract migration |

## The arc, in one paragraph

The creative pipeline went from **0–50 to a median of 70 with a 90 at the top**; conditioning is proven end to end in the provider payload; takes are chargeable and loud on failure; and the floor of 75 is measured rather than guessed. What the arc could not do is make the pipeline clear 75 routinely — **3 of 7 measured beats** — and the record now says so plainly, instead of another round of re-reading.