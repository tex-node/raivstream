# Phase 4 — Publication & Sharing (design)

**Status:** design only. No code, schema, or migrations. READ-ONLY analysis at `feat/raivstream-upgrade @ c4bc985`.
**Scope:** creator submits finished video → moderator approves/rejects → approved content appears on the timeline → withdrawal/resubmission → share links carrying server-issued attribution (owner ≠ sharer).

## 0. What already exists (do not duplicate)

| Surface | Where | Notes |
|---|---|---|
| Content unit | `model Video` (`schema.prisma`, `@@map("videos")`) | `creatorId`, `isPublic`, `isPremiumOnly`, `isKidsSafe`, `contentRating`, `publishedAt`, `shareCount`, `status VideoStatus` |
| Moderation status | `Video.moderationStatus ModerationStatus @default(PENDING)` | enum `PENDING / APPROVED / REJECTED / FLAGGED` (`schema.prisma:44`) |
| Moderation audit | `model ModerationLog` → `moderation_logs` | relation `Video.moderationLogs` |
| Moderator gate | `moderatorProcedure` (`trpc.ts:122`) | role check |
| Moderator/admin tooling | `admin.moderationQueue` (`admin.ts:1160`), `admin.moderateVideo` (:1211), `admin.getModerationStats` (:1258) | |
| Owner identity | `User.username` | the public handle; `Video.creator` relation |
| Attribution display | `Video.creatorId` | owner is already carried on the content row |

**Key finding:** publication is **not** greenfield in the way Phase 0 §6 implied — `Video` already carries `moderationStatus`, `publishedAt`, and `isPublic`, and the moderator tooling already writes `ModerationLog`. Phase 4 is an **extension of `Video` + `ModerationLog`**, plus **one new `ShareLink`** model. No `Post`/`Publication`/`Timeline`/`Share` model needs to be added.

---

## 1. Data model (minimum additive schema)

### 1a. `Video` — additive fields (reuse existing model, **no backfill**)
```prisma
model Video {
  // …existing…
  submittedForPublicationAt DateTime?   // set when a creator submits a finished video
  moderationReason          String?     // last reject/flag reason (mirrors ModerationLog for fast reads)
  withdrawnAt               DateTime?   // set on creator withdrawal; null = live
  // NOTE: moderationStatus (PENDING/APPROVED/REJECTED/FLAGGED) and publishedAt already exist.
}
```
Additive, all nullable → no backfill. Reuses `Video.moderationStatus`.

### 1b. `ShareLink` — new (no backfill; a new table starts empty)
```prisma
model ShareLink {
  id          String   @id @default(cuid())
  videoId     String
  video       Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  token       String   @unique               // opaque, server-issued
  sharerId    String?                        // the SHARER — may differ from the content owner
  sharer      User?    @relation("SharedLinks", fields: [sharerId], references: [id])
  channel     String?                        // 'copy' | 'whatsapp' | 'x' | … (analytics only)
  expiresAt   DateTime?                      // optional expiry (see open decisions)
  revokedAt   DateTime?                      // creator/moderation can kill a link
  clickCount  Int      @default(0)
  createdAt   DateTime @default(now())
  @@index([videoId])
  @@index([sharerId])
}
```
Additive/new → no backfill. Attribution is **on the link** (`sharerId`), which keeps owner identity (`Video.creatorId`) and sharer identity (`ShareLink.sharerId`) **separate by construction**.

### 1c. `ShareAttribution` — new, **in scope** (per-click attribution)
One row per share-link view, recording which link brought the viewer in:
```prisma
model ShareAttribution {
  id           String    @id @default(cuid())
  shareLinkId  String
  shareLink    ShareLink @relation(fields: [shareLinkId], references: [id], onDelete: Cascade)
  viewerUserId String?   // resolved viewer if signed in; null for anonymous viewers
  occurredAt   DateTime  @default(now())
  @@index([shareLinkId])
  @@index([shareLinkId, occurredAt])
  @@index([viewerUserId])
}
```
Additive/new (a new table starts empty → no backfill). Three identities stay distinct: owner = `Video.creatorId`, sharer = `ShareLink.sharerId`, viewer = `ShareAttribution.viewerUserId`.

**Write volume.** A share link is a hot read path; each view writes one row. At, say, 100k views/day a campaign adds ~100k rows/day. **Recommendation: accept direct writes.** One INSERT per view is trivial at this scale (well within Postgres capacity), keeps attribution exact, and avoids a queue/consumer to operate; revisit only if a single link exceeds ~10⁶ views/day. (Sampling would undercount and complicate per-link totals; batching adds infrastructure with no current need.) Table growth is bounded by the §4b retention policy.

### 1d. What is deliberately NOT added
- No `Post`/`Publication`/`Timeline` model — `Video` + `video.moderationStatus = APPROVED` **is** the timeline.
- No new moderation enum — reuse `ModerationStatus`.
- No new attribution column on `Video` — attribution belongs to the share, not the content.

---

## 2. State machine (publication lifecycle)

Reuses `Video.moderationStatus`. **Bold** = transition; `(auth)` = who may trigger it.

```
                     creator submits
  (draft/unpublished) ───────────────► PENDING ◄────────────┐ creator resubmits
                                          │                  │ (after REJECTED/WITHDRAWN)
                        moderator approves│ moderator rejects│
                            (moderatorProcedure)   (moderatorProcedure)
                                          ▼                  ▼
                                       APPROVED ──┐      REJECTED
                                          │       │ creator withdraws
                        creator withdraws │       │      (owner only)
                                          ▼       ▼
                                       WITHDRAWN (withdrawnAt set, moderationStatus→REJECTED-or-PENDING)
                                          │
                        user reports ─────┘──► FLAGGED (moderator attention; not shown in feed)
```

| Transition | Trigger | Authorization |
|---|---|---|
| → `PENDING` | creator submits finished video | owner (`protectedProcedure` + `video.creatorId === ctx.user.id`) |
| `PENDING` → `APPROVED` | moderator approves | `moderatorProcedure` (`admin.moderateVideo`) |
| `PENDING` → `REJECTED` | moderator rejects **with a reason** | `moderatorProcedure`; reason → `ModerationLog` + `Video.moderationReason` |
| `APPROVED` → `WITHDRAWN` | creator withdraws | owner only |
| `REJECTED`/`WITHDRAWN` → `PENDING` | creator resubmits | owner only; clears `withdrawnAt`, keeps prior `ModerationLog` entries |
| any → `FLAGGED` | user report | any signed-in user; **does not** auto-unpublish (moderator decides) |

**Rules**
- Approval is **per content**, not per share: a share link never changes `moderationStatus`.
- Rejection **always records a reason** (append to `ModerationLog`; the latest also cached on `Video.moderationReason` for fast UI).
- Resubmission is a **new review cycle**: it does not delete history; `ModerationLog` keeps every decision.
- Withdrawal is soft: `withdrawnAt` set; content is excluded from the feed (see §3) but the row and its links remain for audit.

---

## 3. Timeline query safety

The feed query must make pending/rejected/withdrawn content **unreachable by ID or URL**, not merely de-emphasised. Enforce it at the *query* layer (never trust a client `isPublic` filter):

```ts
await prisma.video.findMany({
  where: {
    moderationStatus: 'APPROVED',   // only approved content is ever listed
    isPublic: true,                 // creator has not made it private
    withdrawnAt: null,              // not withdrawn
    status: 'READY',                // file is playable
  },
  orderBy: { publishedAt: 'desc' },
});
```

A **single-detail** fetch (e.g. `video.byId`) must apply the same predicate so a guessed ID cannot bypass the feed:

```ts
await prisma.video.findFirst({
  where: {
    id,
    OR: [
      { moderationStatus: 'APPROVED', isPublic: true, withdrawnAt: null, status: 'READY' },
      { creatorId: viewerId },        // the owner may always see their own content
    ],
  },
});
```

**Non-public content therefore never resolves for anyone but its owner (or a moderator), even if the content ID/URL is known.** Share links do not relax this: a link route resolves the token → `videoId`, then applies the identical predicate (§4).

---

## 4. Share-link design

- **Token format:** **opaque, server-issued** (`crypto.randomUUID()` or a 128-bit base64url string), stored on `ShareLink.token @unique`. Not signed/stateless — because links can be **revoked** (`revokedAt`) and can **expire** (`expiresAt`), which a signed token cannot express without a revocation list. Opaque + DB lookup is the smaller, auditable design.
- **Where attribution is stored:** `ShareLink.sharerId` (the sharer) — deliberately separate from `Video.creatorId` (the owner). Shares are created per (video, sharer); `clickCount` gives coarse reach; a 1:1 unique on `(videoId, sharerId, channel?)` can be added if you want one link per sharer.
- **Resolving the originating creator from a link:** the route resolves `token → ShareLink → video`, then reads `video.creator` (owner handle) for *content* attribution; the *share* attribution is `ShareLink.sharer.username`. The end card (§5) always carries the **owner**, never the sharer.
- **Keeping private/unapproved content non-public despite a link:** the link route applies the §3 predicate *after* token resolution:
  ```ts
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { video: true } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return notFound();
  const v = link.video;
  if (v.moderationStatus !== 'APPROVED' || !v.isPublic || v.withdrawnAt || v.status !== 'READY') return notFound();
  ```
  A link to rejected/withdrawn content simply 404s — the URL existing never implies visibility.
- **Platform note:**
  - **Direct share (Web Share API):** mobile browsers + some desktop (Safari, Chrome-Android) support `navigator.share({ url })`. Use it where available.
  - **Copy-link only:** desktop browsers without Web Share (Firefox desktop, many Linux/Windows cases) fall back to clipboard copy. So **copy-link must always be the baseline**, with Web Share as an enhancement.
  - **Deep links into native apps:** out of scope for Phase 4 (would need app-scheme/universal-link work).

### 4a. Attribution record content
`ShareAttribution` stores **only**: `shareLinkId`, `occurredAt`, and `viewerUserId` (set **only** when the viewer is signed in). 
- **IP address: NOT stored** (recommended — an IP is personal data with no product need on this path and is the highest-risk field for KIDS content).
- **The viewer is anonymous by default** — most share-link viewers are not signed in, so `viewerUserId` is null. Attribution that does not require a viewer identity (which link, when) is complete without it.

### 4b. Retention policy
**Recommended default: a rolling 90-day window.** A nightly job (1) aggregates raw rows into a per-link, per-day count (`ShareLinkDailyCount`, additive — `shareLinkId`, `day`, `count`, `@@unique([shareLinkId, day])`) and into `ShareLink.clickCount` for the all-time figure, then (2) `DELETE FROM share_attributions WHERE occurredAt < now() - interval '90 days'`. 90 days is enough for campaign reporting and bounds storage to ~90 × daily volume. Retention may be treated as a pure policy decision, but it must not be left undecided: unbounded raw click rows on KIDS content is the main compliance exposure.

---

## 5. End-card integration (Phase 3 intersection)

Phase 3 inserts the end card **inside `renderOutputDerivative`** (`packages/api/src/lib/creative/output/render.ts`), which is shared by the R16 story export (`storyVideoExportService.ts`) and the 5.0 output service (`creative/output/service.ts`). Because the card is applied **at render time and inside the cache boundary**, **every produced MP4 — the file that is uploaded to R2, downloaded, and shared — already carries the end card.** There is no separate "shared file" pipeline to instrument.

**Intersection points:**
- **Publication:** publishing does not re-render — it flips `Video.moderationStatus` on a `Video` whose `mp4Url`/`hlsMasterUrl` already point at the end-carded derivative. Nothing to add.
- **Download:** the download route serves that same R2 object → card present.
- **Share preview:** any platform preview/thumbnail uses the video's `thumbnailUrl` (a still) — the card is **not** in the thumbnail (thumbnails are frames, not the trailer). If brand must appear in previews, that is a **separate** thumbnail-badge decision, not the end card.
- **Movie Builder is excluded** (`movieRenderWorker.ts` is untouched) — so Movie-Builder output does **not** get the card; publication must not assume a uniform card across all producers. Flag: if Movie-Builder content is publishable, it will share without a card.

---

## 6. Reuse map

| Capability | Builds on | Duplication smell |
|---|---|---|
| Content unit | `Video` | — |
| Publication state | `Video.moderationStatus` (`ModerationStatus`) | ✗ would be duplicated by a new `Publication`/`Post` model |
| Decision audit | `ModerationLog` + `Video.moderationLogs` | ✗ would be duplicated by a parallel audit table |
| Moderator auth | `moderatorProcedure` (`trpc.ts:122`) | ✗ re-implementing a role check is a smell |
| Moderation UI/API | `admin.moderationQueue`, `admin.moderateVideo`, `admin.getModerationStats` | ✗ extend these, do not fork |
| Owner identity | `User.username` via `Video.creator` | — |
| Visibility | `Video.isPublic` | ✗ a second `isPublished` flag would admit drift |
| Derived-file delivery | R2 objects produced by `renderOutputDerivative` (end-carded) | — |
| Share-link identity | `ShareLink` (sharer ≠ `Video.creatorId`) | new by design — no existing equivalent |
| **New** per-click attribution | `ShareAttribution` → `ShareLink` | dedicated table (see note), not `AnalyticsEvent` |

**`ShareAttribution` write path — dedicated table vs `AnalyticsEvent`:** an `AnalyticsEvent` model already exists (`schema.prisma:405`) and backs the general `analytics.track(...)` sink. **Recommend a dedicated `ShareAttribution` table, not `AnalyticsEvent`:** attribution must be exactly and cheaply countable per link (`@@index([shareLinkId])` + `COUNT(*)`) and retention-managed independently. Overloading the general sink turns the count into a filtered scan of a high-volume mixed table and couples share retention to analytics retention. If the team insists on one sink, `AnalyticsEvent` is the only viable piggyback — but it is the weaker option.

**Design smells to reject:** a `Post` model duplicating `Video`; a second visibility flag alongside `isPublic`; a share model that reuses `Video.creatorId` as the "sharer" (collapses owner/sharer); a stateless signed share token needing a revocation list.

---

## 7. Decisions

### Resolved
- **Publication scope: R16-only.** Submission is gated to R16/KIDS content; the main app does not publish to the timeline in Phase 4.
- **Sharing: APPROVED-only.** Non-APPROVED content resolves to a hard 404 even when a share URL exists (§3/§4).
- **Attribution granularity: per-click.** `ShareAttribution` is in scope (§1c), keyed to `ShareLink`.

### Open
1. **Share-link expiry:** none, fixed TTL, or creator-configurable? → drives `expiresAt` UI + cleanup job.
2. **Who owns a share's reach:** does the sharer get any credit/discovery surface, or is attribution analytics-only?
3. **Kids-safe on shares:** must a share of KIDS content be restricted (e.g. no share link at all, or link resolves only in-app)?
4. **Can a moderator take down a *link* without rejecting the video?** → `ShareLink.revokedAt` vs `Video.moderationStatus`.
5. **Retention window:** adopt the proposed rolling 90-day window (§4b), or a different value?
6. **Movie-Builder content publishable?** If yes, its missing end card becomes a brand-consistency decision.

---

## 8. Compliance notes

**Data captured per share-link click** (all in `ShareAttribution`): the link (`shareLinkId`), the time (`occurredAt`), and — only for signed-in viewers — `viewerUserId`. **No IP, no user-agent, no geolocation, no device fingerprint.** Anonymous viewers are the norm and store no identifier.

**Retention:** rolling **90 days** of raw rows, then aggregated to a per-link daily count and the raw rows deleted (§4b). Raw click rows are the main exposure and are time-boxed.

**NDPR/GDPR (KIDS content):** the timeline and share surface are R16-only, i.e. content about/for children, so the bar is higher than for the main app:
- Keep `ShareAttribution` **non-identifying by default** (null `viewerUserId` for anonymous). A signed-in viewer id is personal data — store it only because attribution needs it, apply the 90-day window to it too, and honour erasure (rows are removed by the retention job and by `onDelete` when the user is deleted).
- **Do not** build child-user profiling on this table: attribution is aggregate reporting, not a behaviour profile.
- The **owner and sharer** are adult account holders; their link-level identity is already covered by the app's normal account terms.

**Consent for anonymous viewers:** **not required** for the click path, because nothing personally identifying is stored (no IP, no cookie/device id; only an opaque link id + timestamp). If a later change adds any identifying field (IP, device id, or a persistent cookie), that change **does** trigger a consent/notice requirement — keep it out.

---

### Three most consequential open decisions
1. **Share-link expiry** — none vs TTL vs creator-configurable: drives the `expiresAt` UI and a cleanup job.
2. **Kids-safe share behaviour** — whether KIDS content is shareable at all, or only in-app: the sharpest compliance/product trade-off in this phase.
3. **Retention window** — adopting the proposed 90-day default vs another value: governs raw-row growth and the compliance posture of the attribution table.
