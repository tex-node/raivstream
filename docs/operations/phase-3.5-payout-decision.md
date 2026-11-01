# Phase 3.5 — payout trigger and rejection finality: the two decisions before the UI

**Status:** decided 2026-11-01, before the four UI pages are built, because both decisions
change what those pages must show.

## 1. Payout trigger: revenue period close

**Decision: payouts are computed at a revenue-period close, not on approval and not by a
manual button.**

Reasoning, in order of weight:

1. **Approval-based payout pays before the film earns anything.** A flat amount at approval is
   a grant, not a revenue share, and it makes `shareBps` decorative.
2. **Manual issuance is a placeholder that will be replaced**, and a placeholder in a money path
   is where reconciliation bugs are born: some films paid by hand, some by job, no single answer
   to "what has this filmmaker been paid".
3. The data to do it properly is **already here**: `WatchHistory` records position and
   completion, `Video.completionRate` / `avgWatchTime` are maintained, and the film→video join
   exists through `FilmSubmission`.

### The gap this decision exposes

Period close needs a **revenue basis**, and none exists today. `WatchHistory` says how long
people watched; it does not say what that watching was worth. There is no ad rate, no
subscription-pool allocation, and no per-view price anywhere in the schema.

So the ledger writer cannot be "compute payouts from watch data" — it has to be given something
to divide. The design is therefore **pool + pro-rata**, with the pool set by an operator:

```
FilmRevenuePeriod { id, periodStart, periodEnd, poolCents, status(OPEN|CLOSED|PAID), closedAt, closedById }
```

At close, for each APPROVED submission with at least one watch in the period:

```
filmWatchMs   = Σ WatchHistory.watchTime for the submission's video in [periodStart, periodEnd)
totalFilmMs   = Σ filmWatchMs across all APPROVED submissions in the period
poolShare     = floor(poolCents × filmWatchMs / totalFilmMs)
amountCents   = floor(poolShare × pinnedTerms.shareBps / 10_000)
```

Two properties this buys, both testable without a payment provider:

- a period with **no pool** produces **no payouts** (and must not silently pay zero while marking
  itself paid);
- the **pinned** terms are used, so editing `revenue_terms` after acceptance changes nothing —
  the rule already locked by `termsPinning.test.ts`.

### Why not per-view micropayments

A per-view rate is simpler arithmetic but invents a price. The pool is the honest shape: the
operator says what the period earned in total, and the split is a share of something real.

### What this defers, explicitly

- **No payment execution.** A closed period writes `FilmPayout` ledger rows; moving money
  (Stripe/Paystack transfer, payout accounts, KYC) is a later phase with its own compliance work.
- **No `FilmRevenuePeriod` table yet.** It ships with the ledger writer, not with the UI — the
  UI must not show "earned" figures it cannot compute.

## 2. Rejection finality: a rejection is final for that video

**Decision: a rejection is terminal for the submitted video.** The filmmaker must publish a new
video to be considered again; the submission is not reset to `PENDING`, and the video is not
deleted or altered.

Why:

- `FilmSubmission.videoId` is `@unique`, so one video has one submission — resetting the status
  would erase the review trail (`reviewedBy`, `reviewedAt`, `declineReason`) that exists to make
  the decision auditable.
- The video is immutable once published; "the same film, reconsidered" is genuinely a new
  submission, and a new submission needs its own pinned terms (the terms in force when *it* is
  submitted), which a status reset would lose.

**What the UI must do about it** — the rule is currently discovered, not read:

- `/submit` copy states it plainly: *"If a submission is declined, it is final for that video.
  You can submit a new film at any time."*
- The filmmaker's own list shows a declined submission with its reason and a **"Submit a new
  film"** link, not a "try again" button that would fail against the unique constraint.
- The admin queue never offers "re-open"; a re-review is a new submission with a new pin.

## Consequence for the UI work order

| page | what these decisions change |
|---|---|
| `/submit` | must display the effective terms **and** the rejection-is-final rule; no payout promise |
| `/watch` | nothing — approval already gates it |
| `/filmmakers/[username]` | **no "earnings" panel yet**: there is no period, no pool, no ledger row |
| `/admin/films` | **no payout field**: approval is a decision, not a payment |

The ledger writer (period table, close action, pro-rata computation, `FilmPayout` inserts) comes
after the pages, and the pages must not preview it.
