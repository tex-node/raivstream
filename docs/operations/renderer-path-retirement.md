# Renderer path retirement criteria

**Status:** decided 2026-10-31. Interim: segment path off, single-graph live.
**Destination:** retire the single-graph path, at which point the 44.66 dB
comparison stops existing rather than being accepted.

## Why this is a one-way door

The per-segment pipeline and the single-graph pipeline differ at **44.66 dB PSNR**
in video, with identical frame count, duration and audio stream. The cause is
structural: segments are x264-encoded independently, the single-graph path encodes
the whole timeline in one pass, and independent encodes make different rate-control
and keyframe decisions. No amount of assembly work closes that gap while both paths
exist - copy-concat (`-c:v copy`) bought +0.7 dB (43.96 → 44.66) and no more.

Once the single-graph path is removed, the comparison disappears. The criteria
below are therefore the **last chance to measure the difference**, and they must be
run before the removal, not after.

## Criteria (all four, before removal)

1. **Timeline-identical on 3-5 varied projects.** Not just `cmv14z8t6...`, and not
   just single-character scenes: different scene counts, different character
   counts, different durations. Claim to establish: each project's frame count,
   format duration and audio frame count match the single-graph path exactly. **One
   project with a frame-count delta is a finding and the retirement waits.**
2. **The cache is proven under real iteration.** Not the A/B's single flip, but a
   workflow: change scene 3, re-export, change scene 5, re-export. Each time the hit
   count is `N-1`, the one miss is the changed scene, and the output is
   byte-identical to the previous warm export.
3. **The retention sweep has actually deleted.** `scanned=7 deleted=0` proves the
   listing works, not the delete. One backdated segment object must be swept and the
   export that depended on it must re-render it rather than fail. **A sweep that has
   only ever scanned is a sweep that has never been tested.** This is the acceptance
   test for the cleanup policy.
4. **The single-graph branch is removed in the same change**, not left as a
   fallback. A fallback nobody tests is a path that rots; once the flag is
   permanently off, the branch is dead code.

## What is already established

- Segment path: 993 frames / 33.113991 s / 1427 audio frames - identical to
  single-graph on the baseline project.
- Cache: 5 hits / 1 miss on a scene-3 asset flip; loop 5,515 ms vs 10,973 ms
  (2.0x); byte-identical output when the segments are the same.
- Retention sweep reports on boot: `export_segment_sweep scanned=7 deleted=0`.
- Both flags off in production; the single-graph path is live.
