# VPC-2 Provider Isolation Assessment — 2026-09-12

**Task:** infrastructure/staging provider isolation only. No VPC-2 code change, no benchmark run, no production action.
**Branch:** `feat/visual-prompt-composer-v2`
**HEAD:** `6f2349e1f42d679f8898b4e556de119292658f61`
**origin/main:** `07c37522c3c7169ea462f2fa394a22e540e1134e`

---

## 1. Outcome summary

**No dedicated non-production visual provider exists.** Every staging checkout reuses the production
provider credentials and the production R2 bucket. A real VPC-2 visual benchmark therefore cannot be
run safely from the current staging environment. No real provider request was made.
Staging remains on the offline mock harness only.

## 2. Provider inventory (names only, no values)

### 2.1 Provider variables present in the staging vpc2 env

`RUNPOD_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`,
`RUNPOD_HUNYUAN_ENDPOINT_ID`, `RUNPOD_COGVIDEOX_ENDPOINT_ID`, `RUNPOD_COGVIDEOX_CHECKPOINT`,
`RUNPOD_COGVIDEOX_T5`, `GEMINI_IMAGE_MODEL`, plus `R2_ENDPOINT`, `R2_BUCKET_NAME`,
`R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

### 2.2 Credential relationship to production (relation only)

| Variable | Relationship |
|---|---|
| `RUNPOD_API_KEY` | **SHARED_WITH_PRODUCTION** |
| `GEMINI_API_KEY` | **SHARED_WITH_PRODUCTION** |
| `XAI_API_KEY` | **SHARED_WITH_PRODUCTION** |
| `OPENAI_API_KEY` | **SHARED_WITH_PRODUCTION** |
| `R2_ENDPOINT` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` / `R2_ACCESS_KEY_ID` | **SHARED_WITH_PRODUCTION** |

No staging-only provider key, account, project, or bucket was found.

### 2.3 Which checkouts carry the shared keys (names only)

15 checkouts contain the four provider keys in `apps/web/.env.local`, including `/root/raivstream`
(production) and all `raivstream-*-staging` checkouts. PM2 `pm2_env` does not carry the keys for most
processes because Next loads `.env.local` at runtime; the exception is
`raivstream-phase9b2-audio-staging`, whose PM2 env explicitly sets all four.

PM2 processes whose app cwd maps to a key-bearing checkout: `raivstream-web` (production),
`raivstream-readaloud-staging`, `raivstream-prompt-quality-staging`, `raivstream-phase5c-staging`,
`raivstream-phase6a-staging`, `raivstream-phase6b-staging`, `raivstream-phase7a-staging`,
`raivstream-phase8b2-staging`, `raivstream-phase9a-staging`, `raivstream-phase9b1-staging`,
`raivstream-nocturne-phase1-staging`, `raivstream-phase9b2-audio-staging`,
`raivstream-phase-a-staging`, `raivstream-vpc2-staging`. (`ew-signal-api` is unrelated.)

### 2.4 Endpoint configurability

Only endpoint **overrides** exist (`RUNPOD_FLUX_PUBLIC_ENDPOINT`, `RUNPOD_FLUX_PORTRAIT_ENDPOINT`,
`RUNPOD_WAN26_T2V_ENDPOINT`, `RUNPOD_WAN26_I2V_ENDPOINT`, `RUNPOD_SEEDANCE_PUBLIC_ENDPOINT`,
`OPENAI_BASE_URL`, `*_ENDPOINT_ID`). Changing an endpoint does **not** change the authenticated
account, so it cannot isolate production credentials.

### 2.5 Application controls

| Control | Supported? |
|---|---|
| Provider disable / mock mode | **No** |
| Staging-only provider selection | **No** |
| Request cap | **No** |
| Per-run timeout limiter | **No** (only per-request AbortController timeouts) |
| Image-only guard | **No** (models selected per UI/API call) |
| Dry-run mode | **No** |
| Isolated output storage | **No** (R2 shared with production) |
| Feature flag | `VISUAL_PROMPT_COMPOSER_V2_ENABLED` (staging `false`) |
| Unrelated disable flag | `MOVIE_RENDER_WORKER_DISABLED` (movie renderer only) |

## 3. Staging isolation proof

| Item | Value |
|---|---|
| Staging process | PM2 `raivstream-vpc2-staging` (id 34), online, 0 restarts |
| Staging port | `127.0.0.1:3039` |
| Staging checkout | `/root/raivstream-vpc2-staging` @ `5b04ee4` |
| Staging DB | host `127.0.0.1:55484`, db `raivstream_vpc2_pg` (container `raivstream-phase9a-supabase-postgres`) |
| Production DB | host `172.18.0.2:5432`, db `postgres` |
| DB isolation | **PASS** — distinct host, port, database |
| R2 / output storage | **FAIL** — `R2_*` shared with production |
| Provider credentials | **FAIL** — all shared with production |
| Env files | Real standalone files (no symlink to production) |
| VPC-2 flag | `VISUAL_PROMPT_COMPOSER_V2_ENABLED=false` |
| Benchmark allowlist | `VPC2_VISUAL_BENCHMARK_ALLOW_REAL_PROVIDER=false` (default-off) |
| Staging health | healthy, database ok |
| Production health | healthy; PM2 `raivstream-web` untouched (restarts 299) |

## 4. Security cleanup decision (reported, not performed)

Production provider keys and R2 credentials remain in staging across all staging checkouts.
- Affected variables (names only): `RUNPOD_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`,
  `OPENAI_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`,
  `R2_PUBLIC_URL`.
- Removing/rotating them could affect other staging apps (several share these checkouts).
- **No removal, rotation, or edit was performed.** A separate controlled cleanup task with explicit
  authorization is recommended.
- The VPC-2 benchmark path already unsets the provider keys in its child process and makes zero
  outbound calls, so no real provider call can occur while the allowlist is false.

## 5. Configuration added

- `docs/operations/vpc2-visual-benchmark-allowlist.env.example` — committed, secret-free,
  default-off allowlist template (not loaded by the app).
- `/root/raivstream-vpc2-staging/.env.vpc2-benchmark` — staging-only, **not** loaded by Next
  (Next loads only `.env`, `.env.local`, `.env.<NODE_ENV>`); contains the same defaults, no secrets.

Allowlist defaults:

```
VPC2_VISUAL_BENCHMARK_ENABLED=false
VPC2_VISUAL_BENCHMARK_MAX_REQUESTS=64
VPC2_VISUAL_BENCHMARK_ALLOW_REAL_PROVIDER=false
VPC2_VISUAL_BENCHMARK_IMAGE_ONLY=true
VPC2_VISUAL_BENCHMARK_NO_PRODUCTION_STORAGE=true
```

No VPC-2 composer code, prompt semantics, schema, migrations, UI, or production configuration changed.

## 6. Smoke request

**Not executed.** No safe non-production provider exists, so no provider endpoint was called. Request
count `0`, cost `$0`.

## 7. Validation performed

| Check | Result |
|---|---|
| Config defaults present and off | PASS (`ENABLED=false`, `ALLOW_REAL_PROVIDER=false`) |
| Config not loaded by app | PASS (non-standard filename; staging health/flag unchanged) |
| DB host/port/name isolation | PASS |
| Provider credential isolation | **FAIL** (shared with production) |
| R2 storage isolation | **FAIL** (shared with production) |
| Provider-disable default-off | PASS |
| Secret redaction of new files | PASS (no API key material, no bucket/account ids) |
| Staging process inspection | PASS |
| Staging health | PASS |
| Focused VPC-2 tests | PASS (108/108 at harness commit `5b04ee4`) |

## 8. Remaining prerequisite for the real VPC-2 visual benchmark

All of the following must exist before `VPC2_VISUAL_BENCHMARK_ALLOW_REAL_PROVIDER` can be set true:

1. Dedicated non-production provider account/project (image-capable).
2. Dedicated non-production credential, stored outside Git and not shared with production.
3. Strict spending cap + hard request cap (≤64 images; image-only).
4. Dedicated non-production R2 bucket/prefix (production R2 remains shared today).
5. Staging-only env file/process config (present, default-off) wired to the dedicated key name.
6. Explicit per-request timeout + retry limits and immediate provider kill-switch.
7. Redacting logs (no credentials, no sensitive prompt text).
8. Confirmation that no production DB, ledger, queue, user content, video, or audio is touched.

Until 1–8 are satisfied, the deterministic mock harness
(`scripts/vpc2-visual-benchmark.ts`) remains the only executable benchmark path and does not
establish real visual quality.

## 9. Verdict

```
PROVIDER ISOLATION — NOT EXECUTED — SAFE NON-PRODUCTION PROVIDER UNAVAILABLE
VPC-2 REAL VISUAL QUALITY BENCHMARK — NOT AUTHORIZED IN THIS TASK
PRODUCTION RELEASE — NOT AUTHORIZED / NOT READY
```
