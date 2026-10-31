# Renderer refactor baseline (Phase 2, pre-refactor)

Captured 2026-10-31 before any change to `renderOutputDerivative`. The refactor splits the
single filter graph into per-segment renders; this is the output it must reproduce **exactly**.

## The baseline

| Field | Value |
|---|---|
| Project | `cmv14z8t601fgx61oozrk0lnz` |
| Export row | `cmvw3el9c0001t0f3d05ypwp3` (status `READY`, tier `R16`) |
| Video | h264, **1080×1920**, **30/1 fps** |
| **Frame count** | **993** (`nb_frames` = 993, decoded `nb_read_frames` = 993) |
| **Format duration** | **33.113991 s** |
| Video stream duration | 33.100000 s (993 / 30 = 33.1) |
| Audio | aac, 1428 frames, 33.113991 s |
| **`durationSeconds` in the DB** | **33.113991** — identical to the format duration, i.e. the probe value is what was persisted |
| File size | 28,294,817 bytes |
| **End card** | **applied** — the last two decoded frames are byte-identical (`md5 2efd8199…`), `signalstats` YAVG 16.86 / YMAX 239 (dark card with light text) |
| Project flag | `identityRefsEnabled = true` (so both pipelines must be compared with it true) |
| Renderer version | whatever `EXPORT_RENDERER_VERSION` is at this commit |

Local copy on the VPS: `/root/raivstream/baselines/renderer/fresh.mp4`.

## Why this row and not the older one

`story_video_exports` also holds two pre-existing rows for this project:

- `cmv9ysnu4…` — 2026-10-15, **32.000 s / 960 frames**, `durationSeconds` **NULL**, `tier` NULL.
- `cmv15ql3i…` — 2026-10-09.

They predate the duration probe (#157) and the tier column, and their scene assets have since
changed. They are **not** a valid baseline: `durationSeconds` is null, so the "probe value
persisted" property cannot be checked against them. The baseline above was produced by the
current pipeline today specifically so that both pipelines can be compared on the same assets
and the same flag state.

## The A/B the refactor must pass

1. Render the same project (same assets, same flags) through the new per-segment pipeline.
2. Compare: `nb_read_frames` **993**, format duration **33.113991**, end-card applied, and the
   persisted `durationSeconds` equal to the probe.
3. **A one-frame delta is a finding, not a rounding error.** If the new path produces 992 or
   994 frames, the flag stays off until the difference is explained.

## Note on the export cache

`sourceHash` now includes `identityRefsEnabled`, so this export's hash differs from any
pre-flag export of the project. The next export after any further change to a hash input will
re-render; that is expected, not a bug.
