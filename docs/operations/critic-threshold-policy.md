# Creative Critic threshold policy

**Status:** decided 2026-10-31. Supersedes the implicit 90.

## The decision

`DEFAULT_CREATIVE_CRITIC_THRESHOLD = 80`.

## Why 80 and not another number

The value is set by the calibration data, not by taste:

| Asset | Conditioning | Overall | Identity |
|---|---|---|---|
| `cmvuy10bu…` (scene 1, Sneaky Hopper) | reference-conditioned (`flux-2/edit`) | **85** | **90** |
| older scene 1 image | pre-reference (`flux-2`) | **75** | 80 |

80 is the only value between those two points, so the gate answers the question
the phase is about — **did the creator use their references?** — rather than
"was this perfect".

- 90 would reject the reference-conditioned asset (85): the gate would mean
  "is this perfect".
- 70 would pass both: the gate would mean nothing.

## What the threshold does and does not do

- Assets below 80 return `SUGGEST_REFINEMENT` rather than being blocked. **The
  threshold gates auto-approval, not publication.**
- **It does not retroactively re-score anything.** The 802 assets approved under
  the constant-90 critic remain **provisionally approved pending re-score**.
  This decision is forward-looking only. Reading "threshold 80" as a
  re-evaluation of the backlog is a misreading.

## Context: why the previous value was meaningless

Until 2026-10-30 the critic returned a constant. `creativeCriticProvider.ts`
sent a fully filled-in JSON example instead of a schema, and gpt-4o-mini echoed
it: across 802 completed runs there was exactly one distinct score, 90. A
threshold of 90 therefore equalled the only producible score, and every asset
auto-passed by construction. See the SESSION.md entry for 2026-10-30.

## Revisit

When per-dimension gating lands (Phase 1, piece 3), `characterIdentity >= 85`
becomes the axis to weight, because identity is what the phase is about and the
aggregate can hide it.

## Related open work

- 802 provisionally-approved assets: a re-score sweep needs a **policy** for what
  happens when a re-score returns `SUGGEST_REFINEMENT` on something already live
  in a feed (withdraw / flag / leave with a note). Named in
  `docs/rushfeature.md` future plans alongside the admin takedown gap.
