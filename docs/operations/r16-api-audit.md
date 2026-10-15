# R16 API audit — route blocks vs procedure gates (2026-10-15)

**Read-only.** No code changed. Follow-up to the `createProject` finding (PR #34): some
R16 restrictions live only in the UI route list (`R16_BLOCKED_ROUTES`), not at the tRPC
layer.

## The two layers

**1. UI route block** — `apps/web/src/middleware.ts:40`:
```
R16_BLOCKED_ROUTES = ['/generate', '/director', '/story-studio', '/upload', '/credits',
  '/pricing', '/analytics', '/settings', '/subscription', '/admin', '/create',
  '/projects', '/series', '/studio']
```
Redirects R16 hosts away from these pages. **UI only** — it does not stop a direct API call.

**2. Procedure gates** — `packages/api/src/trpc.ts`:
| Procedure | Gate |
|---|---|
| `publicProcedure` | none |
| `protectedProcedure` | auth only |
| `creativeProcedure` | auth + **`isNotR16`** |
| `r16Procedure` | auth + **`requireR16`** |
| `adminProcedure` | admin |
| `moderatorProcedure` | admin or moderator |

## Coverage by router (verified counts)

| Router | `creativeProcedure` | `r16Procedure` | `protectedProcedure` | Verdict |
|---|---|---|---|---|
| `creative/*` (approval, audio, director, homer, intent, observability, output, production, project, review, series, studio) | **all** (~91) | — | — | ✅ `/create`, `/projects`, `/series`, `/studio` are **API-gated** (`isNotR16`) |
| `director.ts` | 4 | — | — | ✅ gated |
| `video.ts` | — | 3 (submit/withdraw/resubmit) | 7 (upload/update/delete/myVideos/publicationStatus) | ✅ fine (general video ops are R16-appropriate) |
| `admin.ts` | — | — | 0 | ✅ `adminProcedure` 18 / `moderatorProcedure` 10 |
| `feed.ts` | — | — | 2 | ✅ read-only feed |
| **`story.ts`** | — | **8** | **128** | ⚠️ **mostly ungated** |

`story.ts` r16-only procedures: `generateEducationalNarration`, `generateStoryNarration`,
`generateStoryMusic`, `requestStoryVideoExport`, `getStoryVideoExport` (+3).

## Findings

**Why `story.ts` is mostly `protectedProcedure` (not automatically a bug).**
`/story-playground` is **not** in `R16_BLOCKED_ROUTES` — it is the R16 kids story flow —
so the shared story procedures *must* be callable in R16. The route block only covers
`/story-studio` (the legacy non-R16 studio), which **shares the same router**.

**Risk ranking**

| # | Risk | Evidence | Why it matters |
|---|---|---|---|
| **1 (HIGH)** | The **sequence / audio / film (Movie Builder) tabs** are reachable in R16 and their procedures are `protectedProcedure`: `getOrCreateSequence`, `createMovieRender`, `retryMovieRender`, `cancelMovieRender`, `generateCueMusic`, `generateCueSpeech`, `addTrack`, `addCue`, `createVoiceProfile`, `saveAudioVersion`, `restoreAudioVersion`, `reorderSequence`, … | `/story-playground` is not R16-blocked; those procedures are `protectedProcedure` | If these are non-R16 features, an R16 user can drive them directly against the API. Needs a product call on whether they're R16-appropriate (the Movie Builder is used by the kids flow in places). |
| **2 (MEDIUM)** | **`/story-studio`-only procedures** are callable in R16: `buildStoryboard`, `upsertCharacter`, `upsertEnvironment`, `updateShot` (+ `createProject`/`updateProject`, now style-guarded) | route blocked; procedures `protectedProcedure` | The studio route is hidden but its API is open. Low blast radius (same user's own data), but inconsistent with the route intent. |
| **3 (LOW)** | `runCreativeCritic` / `structureProductionManifest` / `applyCriticImprovementPlan` are `protectedProcedure` | story router | These are non-R16 creative-quality features; harmless-ish but exposed. |

## Proposed fixes (ranked; do not apply without approval)

1. **Decide the R16 posture for the sequence/audio/film tabs**, then either
   (a) add `/story-playground` sub-route blocks **and** gate those procedures with
   `creativeProcedure` (or a new `r16BlockedProcedure`), or
   (b) confirm they're R16-appropriate and document it.
2. Gate the four `/story-studio`-only procedures (`buildStoryboard`, `upsertCharacter`,
   `upsertEnvironment`, `updateShot`) with `creativeProcedure` — they have no R16 use.
3. Consider a **lint/CI guard**: any `protectedProcedure` whose route is in
   `R16_BLOCKED_ROUTES` and whose name is studio-only must be `creativeProcedure`.
   (Cheap: a test that parses the router + the route list.)

## Note
This is a report only. No procedures were changed. Items 1–3 need your decision before
any code change.
