# Phase 3.5 — Watch + Submit Films: scoping

**Status:** scoped 2026-11-01, before any implementation. Phase 3 (exposing the 5.0 studio) shipped
the same day; this document is the read that decides what Phase 3.5 has to build.

## What already exists (and therefore is not a gap)

- `Video` is already film-shaped for playback: `duration`, `aspectRatio`, `mp4Url`/`hlsMasterUrl`,
  denormalised `viewCount`, `likeCount`, `avgStarRating`, **`completionRate`**, **`avgWatchTime`**,
  `engagementScore`, plus moderation fields (`isKidsSafe`, `contentRating`, `moderationStatus`).
- Four feeds route through one `feed` router: `forYou`, `trending`, `viewersPick`, `following`.
- An admin moderation queue exists with approve / reject / flag, rating and kids-safe toggles, and
  writes to `ModerationLog`.
- `AnalyticsEvent` exists with a first-party story funnel; `WatchHistory` records position and
  completion per user.

**So playback, ranking, moderation and per-video watch metrics are not the gap.** The gap is
*attribution and ingestion*: nothing in the schema knows that a video is a **film submission** by a
**filmmaker**, or what happens to money when it plays.

## 1. Schema gap

| need | current state | proposed |
|---|---|---|
| filmmaker identity | `User` only (username, displayName) | `CreatorProfile`: bio, headshot, roles (director/writer/producer), links, location, `isVerified`. One per user, optional. |
| film as a submission | `Video` exists, no submission concept | `FilmSubmission`: `videoId`, `creatorId`, `status` (DRAFT/SUBMITTED/IN_REVIEW/ACCEPTED/DECLINED/WITHDRAWN), `submittedAt`, `reviewedById`, `reviewedAt`, `decisionReason`, `festivalId?` |
| film metadata that is not video metadata | none | on `FilmSubmission` (not `Video`): `runtimeSeconds`, `language`, `country`, `credits[]` (JSON), `premiereDate`, `contentWarnings[]` |
| revenue share | none | `RevenueTerms` (per submission): `shareBps`, `effectiveFrom`, `termsVersion`, accepted-at timestamp; **amounts** live in a separate `FilmPayout` ledger — never computed at read time |
| provenance of the film itself | `Video.rawVideoUrl` only | `FilmSubmission.renderJobId?` linking a 5.0 render (Phase 9B.1) to the submission, so a studio-produced film is attributable end to end |

Explicitly **not** proposed: a second playback table. A film is a `Video` with a `FilmSubmission`
row; duplicating playback would fork the feed and the moderation queue.

## 2. Surface gap

| route | purpose | notes |
|---|---|---|
| `/watch` | curated film feed | reuses `feed.forYou` with a `filmsOnly` filter, not a new feed implementation |
| `/watch/[videoId]` | film page with filmmaker attribution and credits | extends the existing `/v/[id]` rather than forking it |
| `/filmmakers/[username]` | filmmaker profile: bio + accepted films | reads `CreatorProfile` + accepted submissions |
| `/submit` | submission flow: pick a ready `Video`, add festival metadata, accept revenue terms | gated to `CREATOR`+; requires a READY, `APPROVED` video |

## 3. Admin gap

- **Film Submissions queue** (`/admin/films`): status filter, side-by-side video preview, credits and
  content warnings, approve/decline with a required reason, and a `ModerationLog`-style audit row.
- **Revenue terms editor**: per-submission `shareBps` with an effective date, plus a change log. An
  operator must be able to answer "what were the terms when this film was accepted?" without a deploy.
- **Payout visibility**: read-only ledger view per film and per filmmaker; the operator does not
  compute shares by hand.

## 4. Analytics gap

`completionRate` and `avgWatchTime` exist **per video**, but nothing attributes them to a
filmmaker, a festival, or a submission cohort. Phase 3.5 needs:

- `film_submitted`, `film_accepted`, `film_declined` (with reason category, not free text);
- a join from `WatchHistory` to `FilmSubmission` so "finish rate for accepted films" is a query, not
  a spreadsheet;
- **no new tracking for playback itself** — reusing `WatchHistory` is what keeps the number honest.

## Acceptance criterion (the A/B-free gate)

> A creator submits a film, an operator approves it, and the film appears on `/watch` with the
> filmmaker's name and the accepted revenue terms attached. An unrelated video's `completionRate`
> does not change, and the film's `Video` row is byte-identical before and after approval except for
> the fields the submission flow is allowed to touch.

Two assertions that make it real rather than plausible:

1. **Attribution is derived, not copied.** `/watch` must render the filmmaker from the
   `FilmSubmission` join; if the name is stored on the video, a renamed filmmaker would go stale.
2. **Approval is not publication.** Accepting a submission must not change `Video.status` or
   `moderationStatus`; the film only becomes visible when its video is already `READY` and
   `APPROVED`. Otherwise the films queue becomes a moderation bypass.

## What Phase 3.5 explicitly does not include

Festival programming/jury scoring, payouts execution (Stripe/Paystack transfers), trailers, series
pages, comments on films, and any change to the 5.0 creative layer. Each is a later phase; this one
is *ingestion + attribution + a watch surface*.

## Sequencing

1. Schema (additive, no behaviour): `CreatorProfile`, `FilmSubmission`, `RevenueTerms`, `FilmPayout`.
2. `/submit` behind a flag (`FILMS_ENABLED`), following the 5.0 flag precedent: env, default off,
   verified in the running process.
3. Admin queue and terms editor.
4. `/watch` + `/filmmakers/[username]`, reading only accepted submissions.
5. Analytics events and the submission↔watch join.

## Ledger Writer: Blocked On

**Status: blocked on a business input, not on code.** No `FilmRevenuePeriod` row exists, no
`film_revenue_periods` table exists yet, and — measured on 2026-11-01 — **there is no revenue in the
system to divide**:

| check | result |
|---|---|
| `film_revenue_periods` table present | **no** (by design; ships with the writer) |
| `subscriptions` rows (Paystack + Stripe) | **0** |
| paid credit purchases, last 90 days | **0** |
| `watch_history` rows (the pro-rata input) | 108 across 9 videos |

So the watch side of the computation is real and the money side is empty. Building the writer now would
mean testing it against a fixture pool — machinery with no caller, which is the `moderateExport` mistake.

### The missing input

1. **A pool amount, and the decision of how it is sized.** The platform does have revenue *sources* wired
   (`Subscription` with Paystack and Stripe, `CreditTransaction` purchases), but neither has produced a
   row yet. A pool therefore cannot be derived; it has to be **declared** by an operator for the first
   period, and the sizing rule (a percentage of subscription revenue? of credit spend? a fixed seed?) is a
   business decision, not an engineering one.
2. **A period boundary.** Monthly is the assumption; nothing in the schema enforces it.

### The test that will prove it when a period exists

The two properties already recorded in `docs/operations/phase-3.5-payout-decision.md`:

- **a period with no pool produces no payouts** — and must not mark itself `PAID` while paying zero;
- **the pinned terms are used**, so editing `revenue_terms` after acceptance changes nothing
  (`termsPinning.test.ts` already locks the second half).

Plus one that only real data can prove: the sum of `FilmPayout.amountCents` for a period never exceeds
`poolCents`, and films with zero watch minutes receive no ledger row (not a zero-value one).

### What would unblock it

Either:

- **the first revenue period** — any month in which `subscriptions` or credit purchases produce a
  non-zero total, which gives the pool a defensible size; or
- **a decision to seed a pool manually for testing**, in which case the writer can be built and the
  no-pool/no-payout property tested against a seeded row — and the seed must be clearly labelled as a
  seed, not as earned revenue.

Until one of those exists, the writer stays unbuilt and `/filmmakers/[username]` keeps having no
earnings panel — a page that says nothing is more honest than a page that says zero.