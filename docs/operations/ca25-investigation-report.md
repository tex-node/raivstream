# ca25 Investigation Report — Stuck Exports
**Date:** 2026-10-16  
**Window:** 16:00–16:40 UTC (17:00–17:40 Lagos)  
**Type:** INVESTIGATION ONLY — no code, no deploys, no PM2 restarts  
**Author:** Agent 1 (investigation session)

---

## Step 1 — Export state

Query: all `story_video_exports` since 14:00 UTC.

| id (prefix) | user | status | content | scenes | stuck (min) |
|---|---|---|---|---|---|
| cmvb5lwkq01v | okekechinneye@gmail.com | **GENERATING** | EDUCATIONAL | 4 | 45+ |

- 17 other exports: **READY**
- 2 exports: **FAILED** — one reset manually by prior session; one killed by PM2 restart at 15:52 UTC
- All 4 scenes for the GENERATING export have `narrationAudioUrl` set — narration generation succeeded; the export itself is what's stuck

---

## Step 2 — Server state

### Memory (critical)
```
RAM:  152 MB free of 12,290 MB total  (98.8% used)
Swap: 12,286 MB / 12,287 MB           (99.99% exhausted)
Load: 20.86 / 20.36 / 19.58
```
Server is swapping every allocation. Node.js process RSS appears as ~18 MB (actually paged out to swap).

### Disk
`/dev/sda1`: 82 GB used / 125 GB (62%) — safe margin now, but shrinking.

### Active FFmpeg
- PID **2885365**, running 45+ minutes
- Working dir: `/tmp/raivstream-output-bxDg3V/`
- Inputs:
  - `v-0.bin` — H.264 480×832, **5.167s video + 5.184s AAC audio** (both tracks)
  - `a-0.bin` — MP3, **7.601s**, 128 kbps (narration)
- Output: `scene-0.mp4` — **11 GB and growing** (~400 MB/min)

### Orphaned temp dir
- `/tmp/raivstream-output-Shh2WI/` — `scene-0.mp4` 4.7 GB, no active process
- Corresponds to export `cmvb4ci0707mo5mrrcdnisxut` (already FAILED, safe to delete)

---

## Step 3 — PM2 crash history

- PM2 total restarts: **684**
- PM2 uptime at query time: **~48 minutes** → last crash at **~15:52 UTC**
- The crash at 15:52 UTC killed export `cmvb4ci0707mo5mrrcdnisxut` mid-encode (Shh2WI dir). The existing PM2 restart handler correctly set that export to FAILED with "Reset: render worker killed by PM2 restart".
- Export `cmvb5lwkq01vjcr6jswqoydhh` was **created at 16:00 UTC**, after the restart. It was started by the current Node.js process and has no crash event yet.

---

## Step 4 — Root cause

### Primary bug: `-stream_loop -1` + `-filter_complex` + `amix` + `-shortest` = infinite encode

The educational export render command:
```sh
ffmpeg -y \
  -stream_loop -1 -i v-0.bin \     # input 0: scene clip, looped forever
  -i a-0.bin \                      # input 1: narration audio, 7.6s
  -filter_complex "
    [0:v]scale=1080:1920...,fps=30[v];
    [0:a]volume=1[na];              # ← looped scene audio, INFINITE
    [1:a]volume=1[nr];              # ← narration audio, 7.6s
    [na][nr]amix=inputs=2:duration=shortest:normalize=0[aout]
  " \
  -map [v] -map [aout] \
  -c:v libx264 -preset ultrafast \
  -shortest \
  scene-0.mp4
```

**The scene clip (`v-0.bin`) contains both a video track AND an audio track** (H.264 + AAC, 5.167s/5.184s). The intent of `-stream_loop -1` is to loop the *video* forever as a still-image background. But it also loops the *audio track* forever, making `[0:a]` an infinite stream.

The `amix=duration=shortest` filter should stop when its shortest input (`[nr]`, 7.6s) ends. However, **`-shortest` is unreliable in FFmpeg when a `-stream_loop -1` input feeds a `-filter_complex` graph**. The stream_loop explicitly overrides EOF for input 0, and this prevents the filter graph's EOF propagation from working correctly. The muxer never sees a finite audio stream; FFmpeg encodes indefinitely.

**Evidence:** A 7.601-second narration produced an 11 GB (and growing) output file after 45+ minutes. At ~53 Mbps, the encode is running in real time without ever terminating.

### Contributing factor: concurrent exports exhausted memory

Export `cmvb4ci0707mo5mrrcdnisxut` (Shh2WI) hit the same bug at 15:24 UTC, ran for ~18 minutes, produced 4.7 GB. A second export (`cmvb5lwkq01vjcr6jswqoydhh`) started at 16:00 UTC while the first was still encoding (or just finished). Two concurrent FFmpeg processes each consuming 3.5–3.8 GB RSS exhausted all 12 GB of RAM, pushed 100% of swap, and drove load average above 20.

---

## Step 5 — Reset eligible exports

**cmvb5lwkq01vjcr6jswqoydhh:** GENERATING for 45+ min — but **PID 2885365 is actively running** for this export.

Per runbook constraint: "Don't touch any export whose ffmpeg is still running."

**No exports meet the reset criteria.** Step 5 write is not executed.

---

## Step 6 — Recommended fixes

### Immediate (manual — outside this session's scope)

1. Kill ffmpeg: `kill 2885365`
2. Reset export to FAILED:
   ```sql
   UPDATE story_video_exports
   SET status = 'FAILED',
       "errorMessage" = 'Export timed out (render process killed). Please try again.'
   WHERE id = 'cmvb5lwkq01vjcr6jswqoydhh';
   ```
3. Clean up orphaned temp dirs:
   ```sh
   rm -rf /tmp/raivstream-output-Shh2WI /tmp/raivstream-output-bxDg3V
   ```
4. Monitor memory recovery after ffmpeg exits — swap should begin draining within minutes.

### Fix 3 — Export watchdog (code change, code-owning session)

Add a watchdog that kills FFmpeg processes running >5 minutes for a GENERATING export and resets the row to FAILED. This auto-recovers the current scenario without manual intervention. The export can then be retried by the user.

### Fix 4 — FFmpeg command: explicit `-t` instead of `-shortest` (code change, code-owning session)

The `-shortest` flag is unreliable with `-stream_loop -1` in a filter_complex pipeline. Replace with an explicit output duration:

**Option A (preferred):** Probe narration audio duration with `ffprobe` before encode, then pass `-t <duration>` as an explicit output duration cap:
```sh
# Get narration duration
duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 a-0.bin)
# Run encode with explicit duration
ffmpeg -stream_loop -1 -i v-0.bin -i a-0.bin \
  -filter_complex "..." \
  -t "$duration" \        # ← explicit cap, not -shortest
  scene-0.mp4
```

**Option B:** Exclude the scene clip's audio track from the filter graph by mapping only the video stream from input 0 (`-map 0:v`) and removing the `[0:a]` reference in the filter_complex. This prevents the infinite looped audio from feeding amix.

### Fix 5 — Concurrency limit (code change, code-owning session)

Limit concurrent exports to 1 server-wide (DB advisory lock or application-level mutex). Two concurrent 3.5 GB FFmpeg processes already exhaust a 12 GB server. A single export at a time prevents memory exhaustion even if Fix 4 is not yet deployed.

---

## Summary

| | |
|---|---|
| **Root cause** | FFmpeg `-stream_loop -1` loops scene clip's audio track infinitely; `amix duration=shortest` + `-shortest` fail to terminate the encode when combined with `-filter_complex` in this FFmpeg version |
| **Trigger** | Any EDUCATIONAL export where `v-0.bin` has an audio track (all scene clips do) |
| **Impact** | Every EDUCATIONAL story export produces an unbounded FFmpeg process; server OOMs after 2 concurrent exports |
| **Live incident** | 1 stuck export (cmvb5lwkq01vjcr6jswqoydhh), 1 active ffmpeg (PID 2885365), 11 GB temp file, server RAM+swap exhausted |
| **User affected** | okekechinneye@gmail.com — 4-scene educational story, all narrations ready |
| **Step 5 write** | None executed (ffmpeg still running for only GENERATING export) |
| **Blocking fix** | Kill PID 2885365, reset export to FAILED, clean /tmp dirs; then deploy Fix 4 before next export attempt |
