# fal Media Provider — Staging Live Validation (Image-First) — 2026-09-12

**Branch:** `feat/visual-prompt-composer-v2`
**Start HEAD:** `c041ce1fd25141fdf2217fb1d813f1b65a6b3dae`
**Status:** **BLOCKED** — required non-production provider key and isolated R2 destination are unavailable.
No live provider call was made; no staging flags were enabled.

## 1. Fresh provenance

| Item | Value |
|---|---|
| Authoritative repo | `C:\Raiv\raivstream` (frozen prototype untouched) |
| Branch | `feat/visual-prompt-composer-v2` |
| `origin/main` | `07c37522c3c7169ea462f2fa394a22e540e1134e` |
| Staging checkout | `/root/raivstream-vpc2-staging` @ `5b04ee4` |
| Staging process / port | PM2 `raivstream-vpc2-staging` (id 34), `127.0.0.1:3039` |
| Staging DB | `127.0.0.1:55484/raivstream_vpc2_pg` (isolated) |
| Production process | PM2 `raivstream-web` — untouched, no restart |
| Production DB | `172.18.0.2:5432/postgres` |
| Production app | `https://app.raivstream.com` — healthy |

## 2. Prerequisite check (blocker)

| Prerequisite | Result |
|---|---|
| Dedicated non-production fal account/project | **MISSING** |
| Dedicated non-production `FAL_KEY` | **ABSENT** (staging `false`, production `false`) |
| Spend cap / request cap | N/A (no key) |
| `FAL_USE_PRODUCTION_STORAGE=false` explicit | Code default false, but not configured in staging |
| Isolated non-production R2 bucket/prefix | **MISSING** — `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID` all **SHARED_WITH_PRODUCTION** |
| Safe-default `FAL_*` flags | Not present (code defaults apply: all disabled, `FAL_MAX_REQUESTS=0`) |

Because no dedicated non-production key exists and R2 has no isolated destination, the task's live
path was stopped before implementation, per the explicit instruction not to reuse production
credentials or storage.

## 3. Foundation inspection (commit `c041ce1`)

- fal-specific shapes are confined to `fal/contracts.ts`; routers/UI use only the provider interfaces.
- Application code does not depend on fal response shapes (no imports outside `mediaProviders/`).
- `FAL_KEY` is read only inside `fal/falMediaProvider.ts`'s transport, server-side, and only when gates are open.
- All submissions gated by `readFalMediaConfig()` + `isFalCapabilityLive()`; default resolution is the mock provider.
- RunPod adapters unchanged and still present.
- No new user-facing pricing; `story:movie_render = 100` unchanged.

## 4. fal contract reconciliation (FLUX.2)

Source: live queue OpenAPI schema `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-2`
and `https://fal.ai/models/fal-ai/flux-2/api`.

**Findings and corrections applied to `fal/contracts.ts`:**
- `fal-ai/flux-2` is **text-to-image only** — the initial contract's `image_url`/`image_urls` fields do **not**
  exist on this endpoint (editing is a separate endpoint, e.g. `fal-ai/flux-2/edit`). The mapper now throws
  `UNSUPPORTED` if image inputs are supplied, rather than silently dropping them.
- Added the real optional inputs: `guidance_scale` (0–20, default 2.5), `num_inference_steps` (4–50, default 28),
  `acceleration` (none|regular|high), `enable_prompt_expansion`, `sync_mode`, `enable_safety_checker` (default true).
- `image_size` enum values are `square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`
  (or `{width,height}` 512–2048). Aspect-ratio normalization now maps `9:16 → portrait_16_9`, `16:9 → landscape_16_9`,
  `4:3 → landscape_4_3`, `3:4 → portrait_4_3`, `1:1 → square_hd`.
- Output is `{ images:[{url,content_type,file_name,file_size,width,height}], timings, seed, has_nsfw_concepts, prompt }`.
  The parser now returns normalized `media` metadata (url/contentType/width/height/fileSize) and records
  `seed` + `nsfwFlagged` in usage metrics.
- Queue: submit → `{ request_id }`; status enum `IN_QUEUE|IN_PROGRESS|COMPLETED`; result fetched separately;
  server `https://queue.fal.run`; auth header `Authorization` (Fal Key).
- H3-Max and VEED Fabric contracts remain **preliminary** and must be reconciled before enabling video/UGC.

## 5. Webhook verification status

fal uses **ED25519 / JWKS**, not HMAC. Implemented `fal/falWebhook.ts`:
- `verifyFalWebhookSignature()` reconstructs `${requestId}\n${userId}\n${timestamp}\n${sha256hex(rawBody)}`,
  decodes the hex `X-Fal-Webhook-Signature`, and verifies against each JWKS `x` (base64url ED25519) using Node's
  built-in crypto (no libsodium dependency).
- ±300s timestamp tolerance rejects stale/replay deliveries; missing headers/malformed signature return false.
- `fetchFalJwks()` fetches `https://rest.fal.ai/.well-known/jwks.json` with a ≤24h cache; injectable for tests.
- The generic HMAC helper remains available but is **not** the fal mechanism.
- No signature/key/body values are logged.
Status: verifier implemented and unit-tested; not yet wired to a staging route (blocked by the missing key/R2).

## 6. Idempotency status

`WebhookIdempotencyStore` (bounded TTL) and `buildWebhookIdempotencyKey()` exist and are unit-tested for duplicate
suppression. Durable persistence and a completion route are deferred to the staging implementation task.

## 7. Credit reservation/settlement status

Not implemented/validated. The existing system is deduct-before-submit with refund-on-failure; the requested
Estimate → Reserve → Submit → Settle/Release lifecycle for the fal path is deferred because it cannot be
validated without a live isolated path. `story:movie_render = 100` is unchanged and no fal price was added.

## 8. Tests

- `pnpm --filter @raivstream/api exec vitest run mediaProviders`: **22/22 pass**.
- `pnpm --filter @raivstream/api test`: **302/302 pass** (was 298; +4, no regressions).
- `pnpm --filter @raivstream/api type-check`: clean. `pnpm --filter @raivstream/api lint`: clean.

## 9. Controlled staging smoke test

**NOT EXECUTED.** No flags enabled; no request submitted; no image produced; no R2 write; request count 0, spend $0.

## 10. Production-impact verification

No production deploy/merge/push/restart; no production env, credentials, DB, R2, queues, or credits touched;
no live provider call. Staging was not modified (still at `5b04ee4`).

## 11. Remaining blockers for a separate staging implementation task

1. Provision a **dedicated non-production fal account/key** (strict spend + request caps), stored outside Git.
2. Provide an **isolated non-production R2 bucket or unmistakable prefix** with staging-only credentials, and
   enforce `FAL_USE_PRODUCTION_STORAGE=false`.
3. Add the dedicated key to a staging-only env file (default-off) — no production env reuse/symlinks.
4. Wire the fal webhook verifier + durable idempotency into a staging-only completion route; keep polling fallback.
5. Implement and test reserve/settle credit lifecycle with double-charge protections.
6. Reconcile H3-Max and VEED Fabric live schemas before enabling video/UGC.
7. Obtain explicit authorization for a bounded staging window with the live-call flag enabled.

## 12. Verdict

```
FAL STAGING VALIDATION — BLOCKED
FLUX.2 LIVE STAGING CALL — NOT EXECUTED
R2 ISOLATION — NOT VERIFIED
WEBHOOK SIGNATURE VERIFICATION — COMPLETE (ED25519 verified in unit tests; not wired to a route)
IDEMPOTENCY — NOT VERIFIED (helper implemented; durable path deferred)
CREDIT SAFETY — NOT VERIFIED
H3 MAX — NOT ENABLED
FABRIC 1.0 — NOT ENABLED
PRODUCTION MIGRATION — NOT AUTHORIZED / NOT EXECUTED
```
