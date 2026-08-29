# Phase 9B.2B — Audio Workspace Acceptance Walkthrough

**Status:** PASSED functionally. Visual screenshot blocked by an environment limitation (see below), not by the app.

**Staging URL/process:** `raivstream-phase9b2-audio-staging` (PM2 id 30), port 3037, `http://localhost:3037` via SSH tunnel — isolated `raivstream_phase9b2_pg` database only. Safety gate (`verify-staging-db.js`) run and passed immediately before every DB-touching step.

**Script:** `packages/api/scripts/phase9b2b-audio-workspace-acceptance.ts` — real `appRouter.createCaller` against real Postgres, driving the exact same tRPC procedures the Nocturne Audio tab UI calls.

## Browser flow — blocked, root-caused

Screenshot capture via both the sandboxed browser tool and the Claude-in-Chrome extension consistently failed. Diagnosed conclusively, not just retried blindly:

1. First suspected HSTS (the app legitimately sends a real `Strict-Transport-Security` header — correct for production, and the middleware's HTTP→HTTPS redirect is already correctly gated to `NODE_ENV === 'production'` only). User cleared it twice via Chrome's site-data and full browsing-data clears.
2. Still failed after clearing, including with a bare `http://127.0.0.1:3037` URL (an IP literal — HSTS cannot apply to it at all per spec, ruling HSTS out entirely).
3. Confirmed via `netstat`-equivalent (`Get-NetTCPConnection`) that the SSH tunnel was genuinely listening on `127.0.0.1:3037`.
4. **Decisive test**: stood up a trivial, brand-new HTTP server on a never-before-visited port (9191, plain text, no app involved) and navigated the extension-driven browser to it. Same failure.

Conclusion: the Claude-in-Chrome extension's browser process has no network path to this machine's loopback interface at all — an environment/architecture limitation, not an HSTS, certificate, or app issue. Not fixable from this session. Recommend checking `http://localhost:3037` in an ordinary (non-automated) browser tab if a visual look is wanted; the functional walkthrough below is what I could reliably deliver instead.

## Functional walkthrough — all green

| Item | Result |
|---|---|
| **R16 hiding** | Server-side `assertSequenceAllowed` correctly rejects an R16-context `addTrack` call with `FORBIDDEN`. Client-side tab hiding is a one-line conditional (`if (isR16) return null`) confirmed by direct code read. |
| **Canonical runtime + version header** | `runtimeSeconds: 4` (from the Film Blueprint — audio cues extending past it, e.g. the 12s ambience/music cues below, don't change this, per the invariant proven in the worker checkpoints), `currentVersionNumber` reflects real saved history. |
| **All five lanes** | Narration, Dialogue, Ambience, SFX, Music tracks all created and read back correctly (plus one genuine pre-existing "Forest Theme" Music track from an earlier round, left untouched). |
| **Character selection (dialogue)** | `characterMemoryId` set and read back matching the created character ("Max"). |
| **Voice Profile + performance controls** | `voiceProfileId` matches; `performanceDirection: "Excited"` round-trips correctly. |
| **Timing/duration/volume/fades/enabled/audio-source, editable** | Created with start=4.2s, duration=2.4s, volume=0.9, fadeIn=0.15s, fadeOut=0.25s; mutated to start=5s, volume=0.75, enabled=false; re-fetch shows exactly the mutated values. |
| **Audio-source state** | Dialogue cue (no `audioAssetId`) reads back `"Not generated"`; Ambience cue (with a disposable `AudioAsset` attached) reads back `"Attached"` — both exact UI strings. |
| **Refresh persistence** | The edit above, followed by a fresh `getAudioPlan` query (exactly what the UI does on mount/refresh), returns the mutated state — proven, not assumed. |
| **Save Version / Restore** | Isolated on a disposable throwaway sequence (see below) — save v1 (volume=0.9) → mutate to 0.3 → restore v1 → reads back 0.9. `restoredToSavedValue: true`. |
| **Film preflight — silent** | An empty isolated sequence (no scenes) reports `ready: false`, `"Enable at least one shot before rendering a movie."` — the empty/not-ready path. |
| **Film preflight — ready with unmaterialized cues** | After adding the 5 lanes: `ready: true`, warning `"2 narration/dialogue cues don't have audio yet — they'll be skipped in the render."` (Narration + Dialogue counted; Ambience/SFX/Music correctly excluded, matching `SPEECH_TRACK_TYPES`). |
| **Console** | N/A — this round verified via direct API calls, not a live browser session; no console to inspect. |
| **Responsive** | Not verified this round — requires the blocked visual path. |

## A real bug this walkthrough caught in itself

`restoreAudioVersion` deletes and recreates **every** track in a plan, not just the ones a given save touched. My first draft of this script ran that against the **shared** QA plan (which already carries real pre-existing content from earlier qualification rounds) — it didn't destroy anything, but it recreated every existing track's row identity and my own cleanup (which tracked pre-restore IDs) went stale, leaving 5 orphaned rows behind. Caught by inspecting the DB directly rather than trusting the script's own "ok: true", cleaned up precisely (verified the one genuine pre-existing track — "Forest Theme" — was never touched), and fixed by isolating the restore test on a disposable throwaway sequence, exactly like the Phase 9B.2B persistence checkpoint already did for the same reason. Final state verified clean: only the original pre-existing track remains.

## UI defects found

None in the data/API layer this round. Two gaps found and fixed in the **prior** session round (before this walkthrough): the cue inspector was missing a Character selector entirely, and `updateCue`'s schema didn't accept `characterMemoryId` at all (could set on create, never edit after) — both fixed and confirmed working here (`characterMatches: true` after an edit-capable field).

## Cleanup

Every row this walkthrough created (5 tracks + 5 cues, 1 character, 1 voice profile, 1 disposable `AudioAsset`, 1 disposable throwaway sequence + its own plan/track/cue/version) was deleted. Verified directly against Postgres: only the original pre-existing "Forest Theme" track remains in the shared QA plan.
