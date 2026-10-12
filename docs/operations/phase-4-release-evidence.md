# Phase 4 — release evidence

Branch `feat/raivstream-upgrade` @ `befc3c5` · READ-ONLY evidence file (no code or schema changes). Nothing here is production-verified.

## 1. Status summary

**Feature-complete and test-verified. Production verification PENDING.**

Phase 4a (publication lifecycle) and Phase 4b (share links + per-click attribution) are implemented and covered by passing tests. **Neither has been exercised against a running/staging environment by this workstream** — every gate below is test-only. The migrations have not been applied. This is not a GO; see the CONDITIONAL GO in §6.

## 2. Feature inventory

| Feature | Implementation commit(s) | Test coverage | How the gate is met |
|---|---|---|---|
| **Phase 4a** — R16 publication lifecycle (submit / withdraw / resubmit) + timeline visibility | `009b739` | `routers/__tests__/publication.test.ts` (16) | Owner-only submit requires `READY`; approval is the existing `admin.moderateVideo`; feed and by-ID restrict to `APPROVED` + public + not-withdrawn |
| **Phase 4b** — share links + per-click attribution + 90-day retention | `5c672a1` (models), `fb15410` (create/revoke/list/resolve + retention + UI) | `routers/__tests__/shareLinks.test.ts` (11) + `lib/story/__tests__/shareAttributionRetention.test.ts` (3) | APPROVED-only resolution (`NOT_FOUND` otherwise, no attribution); attribution resolves to the owner's handle; anonymous vs signed-in `viewerUserId` differ; no IP |
| **Phase 4b UI** — share menu | `fb15410` | `lib/__tests__/shareTargets.test.ts` (3, `befc3c5`) | WhatsApp encodes the link; Instagram is copy-link only; native share only when available |

## 3. Release gate evaluation

> Gate text from the upgrade plan:
> - "Moderator approval required for timeline publication"
> - "Share attribution resolves to the correct account"
> - "Private content stays private"
> - "Exported videos carry the required end card"

| Gate criterion | Verification | Test-only or also live? |
|---|---|---|
| Moderator approval required for timeline publication | `publication.test.ts:46` (owner-only submit), plus the R16 feed requires `APPROVED` (`publication.test.ts` "feed filtering"); the moderator decision itself is the pre-existing `admin.moderateVideo` (untouched) | **Test-only** — no moderator action was exercised live |
| Share attribution resolves to the correct account | `shareLinks.test.ts` — anonymous write `{ viewerUserId: null }`, signed-in write `{ viewerUserId: 'viewer-9' }`, and `creatorHandle === 'ada'` (owner, never the sharer) | **Test-only** |
| Private content stays private | `publication.test.ts` — feed excludes `PENDING`/`REJECTED`/withdrawn; by-ID restricted to `APPROVED` + public + not-withdrawn. `shareLinks.test.ts` — revoked / non-`APPROVED` / withdrawn → single identical `NOT_FOUND` with **no attribution written** | **Test-only** |
| Exported videos carry the required end card | `endCard.test.ts:39`/`:47` (exactly 2 s appended; one continuous video+audio concat). The download path was **read** (not executed): `apps/web/src/app/api/story/export/[exportId]/download/route.ts:40` proxies the end-carded R2 object | **Test-only** (filter graph); the download path is source-reviewed, not exercised |

**Explicitly test-only:** all four. No Phase 4 gate was exercised against a running environment by this workstream.

## 4. Known limitations (honest)

1. **End card present only on render-pipeline output — accepted limitation.** The 2 s card (Phase 3 `ef6f8d8`) is baked in by `renderOutputDerivative`; a `Video` whose `mp4Url` is a raw direct upload (`video.confirmUpload`) is **not** end-carded. **Decision: Option A — uploads are not exports**, so uploads are intentionally not carded.
2. **Retention aggregation is manual — accepted limitation.** `admin.runShareAttributionRetention` is admin-triggered, not scheduled; raw 90-day-old rows remain until an admin runs it. (The pure job is idempotent, so a scheduled caller can be added later.)
3. **Native share is best-effort — accepted limitation.** The share menu uses `navigator.share` when available and **promises direct upload to no platform**; Instagram is copy-link only.

## 5. Pending operator actions

1. **Apply migrations, in timestamp order** (none applied by this workstream):
   1. `20261012190000_share_links` — commit `5c672a1`
   (and, if not already applied: the Phase 2 queue — `…120000` `3911c14`, `…130000`/`…140000` `c4bc985`, `…150000` `009b739`, `…160000` `5ef5933`, `…170000` `e42dcf8`, `…180000` `6f9447c`.)
   `prisma migrate deploy`; all are additive.
2. **Verify the end card on the VPS** — `pnpm verify:end-card` on an ffmpeg host (duration = source + 2 s; one h264 + one aac; handle visible).
3. **Confirm VPS HEAD** — `git -C /root/raivstream rev-parse HEAD`.
4. **PR hygiene** — merge `ci/phase6d-gates` (PR #3) first, then rebase `ci/r16-test-gates` (PR #2).
5. **Phase 4 staging verification (would consist of):** on staging with a reachable DB — (a) submit an R16 video, approve it via the moderator path, confirm it appears in the R16 feed; withdraw it and confirm it disappears; (b) create a share link, open it signed-out and signed-in, confirm attribution rows (`viewerUserId` null vs set) and that the page shows the owner's handle; (c) revoke the link and confirm a hard 404; (d) run `admin.runShareAttributionRetention` and confirm `[share.retention]` counts; (e) download an approved export and confirm the end card.

## 6. Release decision

**CONDITIONAL GO** — feature-complete and test-verified; production verification is blocked on the operator queue in §5.

Conditions: (1) `20261012190000_share_links` applied (plus any outstanding Phase 2 migrations, in order); (2) end card verified on an ffmpeg host; (3) VPS HEAD confirmed; (4) Phase 4 staging verification run, especially the signed-out vs signed-in attribution behaviour and the APPROVED-only 404 (**both currently test-only**).

Not a GO (no gate exercised in a running environment) and not a NO-GO (no gate failed).
