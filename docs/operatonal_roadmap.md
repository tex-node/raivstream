# Raivstream — Operational Patterns Roadmap

**Purpose:** classify the 19 infrastructure patterns requested on 2026-10-16 into
what we need now, what we'll need later, and what we don't need. Prevent premature
investment while closing the real gaps the last month exposed.

**Current architecture:** one Next.js process on one VPS (PM2), one Postgres
(self-hosted Supabase), Caddy as reverse proxy, Docker for Supabase only, GitHub
Actions for CI/CD. Raivstream shares the VPS with UltraLeague and Powervend.

**Guiding principle:** solve the problem in front of you. Add distributed-systems
complexity only when a specific, observed failure requires it.

---

## Classification

| # | Pattern | Verdict | When |
|---|---|---|---|
| 1 | Rate Limiting | **NOW** | Next 4 weeks |
| 2 | Caching | **NOW** | Next 4 weeks |
| 3 | Load Balancing | LATER | Only if we go multi-host |
| 4 | Reverse Proxies | **EXISTS** | Caddy — document, don't rebuild |
| 5 | API Gateways | LATER | Only if we split services |
| 6 | CI/CD | **NOW** | Incremental improvements |
| 7 | Docker | **NOW (partial)** | App containerization for consistency |
| 8 | Kubernetes | **NEVER (at this scale)** | Reconsider above 50× traffic |
| 9 | Service Discovery | **NEVER (at this scale)** | Only with multiple services |
| 10 | Circuit Breakers | **NOW** | Provider boundaries |
| 11 | Timeouts | **NOW** | Unified policy |
| 12 | Retries | **NOW** | Unified policy |
| 13 | Exponential Backoff | **NOW** | With retries |
| 14 | Idempotency | **PARTIAL — extend** | Beyond credit ledger |
| 15 | Message Queues | **NOW** | Export/batch/movie workers |
| 16 | Pub/Sub | LATER | Only with event-driven |
| 17 | Event-Driven Architecture | **PARTIAL / DESIGNED** | Analytics + notifications only |
| 18 | Distributed Transactions | **NEVER (single DB)** | Reconsider if multi-DB |
| 19 | Saga Pattern | **NEVER (single DB)** | Same |

---

## Phase 1 — The platform that pays for itself (next 4 weeks)

These close observed gaps. Each is independently shippable.

### 1.1 — Export worker (Message Queue, item 15)

**Problem:** Export, batch generation, and movie render run inside the
`raivstream-web` Next.js process. One bad export took down the whole web app and
two other apps on the VPS (2026-10-16 demo).

**Solution:** Move long-running work to a separate PM2 process with a durable queue.

- Queue: `pg-boss` (Postgres-backed — we already have Postgres; no new infra).
- New PM2 process: `raivstream-worker` — same repo, separate entrypoint.
- Jobs: `export.story`, `batch.scene`, `movie.render`.
- The web process enqueues; the worker runs. One queue, one worker type, one
  concurrency limit per job kind.
- Worker kills itself on a runaway job (bounded by the ffmpeg timeout from D-031).

**Why pg-boss over BullMQ/Redis:** we already run Postgres; adding Redis is a new
piece of infra to operate. pg-boss gives durable jobs, retries, scheduled jobs,
and a dead-letter pattern on the DB we already have. If we outgrow it, migrating
to a Redis-backed queue later is straightforward.

**Deliverable:** `apps/worker` (new) + PM2 ecosystem entry + queue tables + the
first migrated job (export). Batch and movie render migrate in Phase 1.

**Exit criterion:** killing `raivstream-web` mid-export does not lose the job; the
worker picks it up on next start.

### 1.2 — Circuit breakers at provider boundaries (item 10)

**Problem:** When fal, ElevenLabs, or Lyria is slow or down, every request to that
provider waits for the full timeout. Three concurrent slow calls saturate the
request pool.

**Solution:** A small circuit breaker per provider (fal, ElevenLabs, Lyria,
OpenAI, Claude).

- States: closed → open (after N consecutive failures) → half-open (probe after
  cooldown) → closed.
- Config: N=5 failures / 60 s; cooldown 30 s; half-open allows 1 in-flight probe.
- Open state returns a typed `PROVIDER_CIRCUIT_OPEN` immediately — no timeout wait.
- Per-process (in-memory) — the worker and web have separate breaker state.

**Deliverable:** `packages/api/src/lib/resilience/circuitBreaker.ts` +
provider adapters wrap their submit calls.

### 1.3 — Timeout / retry / backoff policy (items 11, 12, 13)

**Problem:** Timeouts and retries are ad-hoc per adapter. ElevenLabs has retry
backoff; fal submits don't. DB queries have no timeout.

**Solution:** A single `withResilience()` wrapper applied at every boundary.

```ts
withResilience(
  fn,
  {
    timeoutMs: 30_000,
    retries: 2,
    backoff: 'exponential',   // 250ms, 500ms, 1s, ...
    jitter: true,
    breaker: 'fal',
    idempotencyKey: 'gen:${jobId}',
  }
)
```

Defaults per boundary:
- Provider submit/poll: timeout 30 s, retries 2, exponential backoff with jitter
- DB query: timeout 5 s, retries 0 (DB failures are not transient in the same way)
- Internal tRPC: timeout 15 s, retries 0 (client retries if desired)

**Deliverable:** `packages/api/src/lib/resilience/withResilience.ts` + migration
of the top 5 provider call sites.

### 1.4 — Rate limiting per user (item 1)

**Problem:** An authenticated user can issue unlimited requests. A misbehaving
client can saturate the API.

**Solution:** tRPC middleware with a token bucket per user (and per IP for
unauthenticated). Backed by Upstash Redis (already in the stack, currently
underused).

- Authenticated: 60 req / min per user, burst 20
- Unauthenticated: 20 req / min per IP, burst 5
- Expensive mutations (generate, export): 10 req / min per user, burst 3
- Response: HTTP 429 + `Retry-After` header

**Deliverable:** `packages/api/src/lib/resilience/rateLimit.ts` + tRPC middleware
+ Upstash Redis client (already configured).

### 1.5 — Caching (item 2)

**Problem:** Feed queries, model metadata, provider health, and story workspace
hit Postgres on every request.

**Solution:** Upstash Redis for read-heavy, tolerate-staleness-wins data.

- **Feeds** (`forYou`, `trending`): 30 s TTL, invalidated on publish/moderate
- **Model metadata** (`listModels`): 5 min TTL, invalidated on admin change
- **Provider health** (`/api/ready`): 60 s TTL
- **Story workspace** (per project): 10 s TTL, invalidated on any story mutation

Rule: cache is **always invalidated on write, not just TTL'd**. No stale reads.

**Deliverable:** `packages/api/src/lib/cache/` + cache keys + invalidation wiring
in the top 4 read paths.

### 1.6 — Idempotency expansion (item 14)

**Problem:** Credit ledger is idempotent (Phase 1). Export, batch, publish, and
movie render are not — retries can double-charge or double-publish.

**Solution:** Apply the same pattern (client-supplied UUID + unique constraint) to:
- `requestStoryVideoExport` — dedupe by `(projectId, sourceHash)` (already done)
- `createMovieRender` — dedupe by `(projectId, renderPlanHash)` (already done)
- `startBatchGeneration` — dedupe by `(projectId, sceneIdsHash)` (add)
- `video.submitForPublication` — dedupe by `(videoId, action, idempotencyId)` (add)

**Deliverable:** 2 new idempotency keys + tests.

### 1.7 — Docker for the app (item 7, partial)

**Problem:** The app runs on PM2 with node_modules on disk. Environment drift
between local and prod is real (three env-file bugs in the last month).

**Solution:** Containerize `raivstream-web` and `raivstream-worker`. Keep
PM2 as the process manager if you want, but ship Docker Compose as the
canonical dev/prod parity layer. Supabase is already Docker — this unifies the
stack.

- `apps/web/Dockerfile` — multi-stage build, distroless-ish base
- `apps/worker/Dockerfile`
- `docker-compose.app.yml` — Caddy, web, worker, redis (later)

**Do NOT** containerize the whole stack in one step. Web first; worker with 1.1.

**Deliverable:** Dockerfile + compose file + CI step that builds the image.

### 1.8 — CI/CD improvements (item 6)

**Problem:** Deploy is `git pull + build + PM2 restart`. Rollback is manual. No
canary. No staging environment.

**Solution:**
- **Staging environment** on the VPS: same repo, separate PM2 process, separate
  Postgres DB, runs on merge to `main` after prod acceptance is confirmed.
- **One-click rollback**: `gh workflow run rollback.yml -f sha=<previous>` —
  checks out the prior SHA and restarts PM2.
- **Deploy smoke test**: after PM2 restart, hit `/api/health` and one real
  endpoint. Fail the workflow if either is red.
- **Migration gate**: `prisma migrate status` must be clean before the build
  starts (catches the drift that caused the 2026-10-13 incident).

**Deliverable:** `.github/workflows/deploy.yml` upgrades + `rollback.yml`.

---

## Phase 2 — When the architecture earns it (3–6 months)

### 2.1 — Reverse proxy documentation (item 4 — exists)

**Status:** Caddy already does this. Gap is documentation, not implementation.

**Action:** Write `docs/operations/network-topology.md` — what listens where,
which ports are bound to loopback vs 0.0.0.0, what Caddy fronts. This is the
document that would have prevented the port-exposure finding.

### 2.2 — Event-driven for analytics + notifications (items 16, 17 — partial)

**Status:** Some fire-and-forget already exists (analytics writes, moderation
scans). The gap is a formal pub/sub layer for events that multiple consumers
care about.

**When to build:** when analytics, notifications, and moderation all need to
react to the same events and doing it inline becomes tangled.

**Design sketch:** Postgres `LISTEN/NOTIFY` as the transport (no new infra).
Events: `story.published`, `generation.completed`, `export.ready`, `credit.spent`.
Consumers: analytics writer, notification sender, moderation scanner.

**Do NOT do this until at least three consumers exist.** Two consumers = inline
calls.

### 2.3 — Load balancing + horizontal scaling (item 3)

**When:** when a single VPS can no longer handle web traffic (measurement: p95
latency > 500 ms with the worker isolated).

**Approach:** two web processes behind Caddy, then two VPSes behind a managed
load balancer (Cloudflare Load Balancing, ~$5/mo).

**Prerequisite:** the worker split (Phase 1.1). Otherwise you can't scale web
independently from work.

### 2.4 — API Gateway (item 5)

**When:** when you split the app into two or more services (e.g. a dedicated
media API separate from the app API).

**Do NOT** add Kong/Traefik in front of tRPC now — tRPC is the gateway. Adding a
second hop would add latency without solving any current problem.

---

## Phase 3 — Not for Raivstream (as currently sized)

These are documented so nobody proposes them again without a changed premise.

### 3.1 — Kubernetes (item 8)

Single-node K8s is an anti-pattern: you get all the complexity and none of the
resilience. K8s becomes worthwhile when:
- You have ≥3 nodes across ≥2 availability zones
- You need autoscaling tied to load
- You have ≥4 services that need independent scaling

None is true today or projected within 12 months.

**Alternative:** PM2 + Docker Compose gives 90% of what a small team actually
needs from orchestration (restart on crash, zero-downtime restart, log
aggregation).

### 3.2 — Service Discovery (item 9)

Service discovery solves "which IP is service X on right now, out of N replicas?"
When there's one web process, one worker, one Postgres, and Caddy knows their
addresses, discovery is a non-problem.

### 3.3 — Distributed Transactions (item 18)

Two-phase commit, XA, and their cousins exist when you have **multiple
datastores that must commit atomically**. Raivstream has one Postgres. The
correct tool is a single Postgres transaction.

### 3.4 — Saga Pattern (item 19)

Sagas exist when a workflow spans multiple services that can't share a
transaction. Raivstream workflows are within one Postgres — a transaction, a
job row, and an idempotency key cover the cases (this is how Phase 1 credit
reserve/settle already works).

---

## The honest summary

**Do now (Phase 1):** worker split, circuit breakers, unified resilience policy,
rate limiting, caching, idempotency expansion, Docker for web+worker, CI/CD
improvements.

**Do later (Phase 2):** reverse-proxy documentation, event-driven for analytics
+ notifications, horizontal scaling, API gateway (only if services split).

**Never (at this scale):** Kubernetes, service discovery, distributed
transactions, saga pattern.

**Already exists, keep using:** Caddy (reverse proxy), PM2 (process manager),
Docker for Supabase, GitHub Actions (CI/CD), Postgres advisory locks (mutex),
per-provider rate limits (in-process).

**The trap to avoid:** solving problems you don't have. Every hour spent on
Kubernetes is an hour not spent on the worker split, which is the thing that
would have prevented the demo outage.