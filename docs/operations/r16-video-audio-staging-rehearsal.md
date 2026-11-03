# R16 Video Audio A/B/C — Staging Rehearsal & Release-Gate Preparation

**Date:** 2026-10-11
**Prepared by:** automated preparation pass (read-only; no push/deploy/migration)
**Repo:** `tex-node/raivstream` · `C:\Raiv\raivstream` · branch `main` @ `9d8ca17`
**Companion evidence:** `docs/operations/r16-video-audio-phase-abc-verification.md` (§13 first pass, §14 gate-closure)

This document is preparation only. It contains the CI-enforcement finding, the candidate reconciliation, the operator-ready staging rehearsal (S1–S11), the DBA migration-review package, and the FFmpeg validation arrangement.

---

## 1. CI / release-procedure enforcement — FINDING (gap)

**Question:** does CI/the release workflow enforce **both**
`pnpm --filter @raivstream/api test` **and** `pnpm --filter @raivstream/api test:integration`?

**Answer: NO.** There is exactly one workflow, `.github/workflows/deploy.yml`, and it runs **no tests at all**. Its steps are:

```
Deploy to VPS via SSH →
  git fetch/reset origin/main
  pnpm install --frozen-lockfile
  prisma migrate deploy / validate / db:generate
  web build (.next-build)
  api type-check · web type-check · web lint
  atomic .next swap · pm2 restart · health curl
```

- No `test`, `vitest`, or `test:integration` step exists anywhere in CI (verified: only `deploy.yml`; grep for `test|vitest|integration` finds no test step).
- `turbo.json` defines a `test` task and root `package.json` maps `test → turbo run test`, but **nothing invokes it** in CI.
- Consequence (exactly the risk flagged): a release can be **green on type-check/lint/build while neither the unit suite nor the real-DB integration suite ran**. My test-harness change makes `test:integration` an explicit separate command — which makes CI enforcement *more* necessary, not less.

**RESOLVED (implemented in `.github/workflows/deploy.yml`; uncommitted).** Two jobs — `test-unit` and `test-integration` — were added, and the `deploy` job now declares `needs: [test-unit, test-integration]`; the integration job provisions a disposable `postgres:17` service and fails closed on the DB-skip path. See `docs/operations/r16-ci-test-gates-verification.md`. The original proposal (below) is retained for reference:

```yaml
  test:
    name: Tests (unit + real-DB integration)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_HOST_AUTH_METHOD: trust }
        ports: ['5433:5432']          # matches the test's hardcoded URL
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 10s
          --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Unit suite
        run: pnpm --filter @raivstream/api test
      - name: Prepare disposable test DB
        env:
          DATABASE_URL: postgresql://postgres@localhost:5433/raivstream_phase6d_test
          DIRECT_URL:   postgresql://postgres@localhost:5433/raivstream_phase6d_test
        run: |
          psql "postgresql://postgres@localhost:5433/postgres" -c "CREATE DATABASE raivstream_phase6d_test"
          pnpm --filter @raivstream/database exec prisma generate
          pnpm --filter @raivstream/database exec prisma db push --schema schema.prisma --skip-generate
          psql "postgresql://postgres@localhost:5433/raivstream_phase6d_test" -v ON_ERROR_STOP=1 \
            -f packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql
      - name: Real-DB integration
        run: pnpm --filter @raivstream/api test:integration
```

Alternative if CI is to stay deploy-only: make the **release procedure** mandate both commands as a hard gate (a `test:all` convenience script) and require the operator to attach both outputs to the release record. Either way, **the integration command must be non-optional**.

---

## 2. Final-candidate reconciliation

### 2.1 Identity

- Branch `main`, HEAD `9d8ca17` (Phase B), tracks `origin/main`, **ahead 5**. Staged: none.
- Committed A/B/C: `c188f76` (A), `4330faa` (C), `9d8ca17` (B); base `8ace7a0` (6D). Migrations `20261009110000`/`20261009120000`/`20261009130000` are **already committed** (6D/A/B).
- The **local candidate = HEAD + the uncommitted release-relevant working-tree files below.**

### 2.2 Intended candidate files (review these diffs; include on commit)

| File | State | Role |
|---|---|---|
| `packages/api/src/routers/story.ts` | M | Phase A: generate→moderate→persist via `resolveNarrationScript` |
| `packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts` | M | mock-hoist hardening (no skips/assertions weakened) |
| `packages/api/src/lib/story/narrationScript.ts` | ?? | Phase A helper (new) |
| `packages/api/src/lib/story/__tests__/narrationScript.test.ts` | ?? | Phase A regression (new) |
| `packages/api/vitest.config.ts` | M | exclude real-DB integration from parallel unit suite |
| `packages/api/vitest.integration.config.ts` | ?? | isolated integration config (new) |
| `packages/api/package.json` | M | `test:integration` script |
| `docs/operations/r16-video-audio-phase-abc-verification.md` | ?? | release evidence (§13/§14) |
| `session.md` | ?? | living record — **see case-collision hazard** |
| `packages/api/scripts/r16-render-validation.ts` | ?? | FFmpeg validation harness (new, this pass) |

**Exact diffs to review** (commands):
```
git -C C:\Raiv\raivstream diff -- packages/api/src/routers/story.ts \
  packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts \
  packages/api/vitest.config.ts packages/api/package.json
git -C C:\Raiv\raivstream diff --no-index NUL packages/api/src/lib/story/narrationScript.ts   # new files
```

### 2.3 Unrelated working-tree files — must NOT be committed

`.claude/settings.local.json` · `.claude/launch.json` · `.claude/scheduled_tasks.lock` · `.codex/` · `AGENTS.md` · `UI-v2/` · `UI/*` · `_to_delete/` · `docs/RAIVSTREAM*.txt` · `docs/Raivstream*.txt` · `docs/RAIVSTREAM_5_PRODUCT_ROADMAP_AND_IMPLEMENTATION_PLAN.md` · `docs/operations/phase-3-browser-acceptance-b01-b20.md` · `scripts/ca25c-*.ts` · `session/` · `skills/` · `test/`.

### 2.4 Hazard — `SESSION.md` ↔ `session.md` case collision

Git tracks `SESSION.md`; the working tree has `session.md` (lowercase) → status shows **` D SESSION.md` + `?? session.md`** on this case-insensitive checkout. Committing `session.md` while `SESSION.md` is tracked risks a path conflict / silent case rename. **Resolve deliberately** (either commit a single canonical casing, or leave it out of the release commit) — do not silently absorb it. The content edits are legitimate (R16 living-record entry).

---

## 3. Staging rehearsal — operator checklist (S1–S11)

Run on staging with an authorized R16 account. **Do not seed `story:background_music`; do not set `LYRIA_MUSIC_ENABLED=true`** except for S9 under its separate music authorization. Record for each: status (PASS/FAIL/BLOCKED/NOT TESTED), operator, timestamp, exact command/step, and captured evidence.

| # | Check | Preconditions | Steps | Expected | Evidence |
|---|---|---|---|---|---|
| S1 | Educational R16 export w/ narration | R16 account; OpenAI + ElevenLabs + R2 configured; `story:speech_generation` rate seeded | Generate an educational story → export | Export has video+audio; narration audible | Export URL + `ffprobe` streams |
| S2 | Non-educational `generateStoryNarration` | R16 account; providers configured | Call procedure on a scene | `{ audioUrl }`; `storySceneSeed.narrationAudioUrl` set | tRPC response + DB row |
| S3 | Narration-only export | from S2 | Export without music | Valid video+audio stream | `ffprobe` output |
| S4 | Probe final export | from S3 | `ffprobe` the file | video + audio stream, expected duration | ffprobe JSON |
| S5 | Music `null` when flag off | `LYRIA_MUSIC_ENABLED` unset | Call `generateStoryMusic` | `{ backgroundMusicUrl: null, reused: false }`, no charge | tRPC response + credit ledger |
| S6 | Music `null` when rate absent | no `story:background_music` rate | Call `generateStoryMusic` | `null`, no charge | tRPC response + ledger |
| S7 | Moderation blocks synthesis | staging | Inject disallowed narration content | BAD_REQUEST; nothing persisted; no charge | error + `storySceneSeed.narrationScript` still null |
| S8 | Failed synthesis → refund | staging (simulate R2 failure) | Force upload failure | refund under same key; error surfaced | ledger: USAGE + REFUND net 0 |
| S9 | Music-enabled export blended | **music authorization**; flag on; rate seeded | Generate music → export | blended audio; speech intelligible | export + listening + `ffprobe` |
| S10 | R16/KIDS guard rejects non-R16 | non-R16 session | Call `generateStoryNarration` | FORBIDDEN | tRPC error |
| S11 | Educational rejected by narration proc | R16 session | Call with `contentType=EDUCATIONAL` | PRECONDITION_FAILED ("Use generateEducationalNarration") | tRPC error |
| (S12) | phase6d integration isolated | reachable disposable PG | `pnpm --filter @raivstream/api test:integration` | 4/4 | test output — **local disposable cluster already PASS** |

**Who:** S1–S8/S10–S11 require the authorized staging operator (provider credentials). S9 additionally requires separate music authorization. The agent can only run S12 locally.

---

## 4. DBA migration-review package

Both migrations are additive and nullable:

| Migration | Table | Statement |
|---|---|---|
| `20261009120000_phase_a_story_scene_narration_script` | `story_scene_seeds` | `ALTER TABLE "story_scene_seeds" ADD COLUMN IF NOT EXISTS "narrationScript" TEXT;` |
| `20261009130000_phase_b_story_project_background_music` | `story_projects` | `ALTER TABLE "story_projects" ADD COLUMN IF NOT EXISTS "backgroundMusicUrl" TEXT;` |

- **Locking/impact:** nullable, no default → PostgreSQL ≥ 11 performs a **metadata-only** `ADD COLUMN` (no table rewrite); only a brief `ACCESS EXCLUSIVE` catalog lock. Both tables are not high-write in R16 paths.
- **Idempotency:** `IF NOT EXISTS` — safe to re-run. **Rollback:** `ALTER TABLE … DROP COLUMN …` (no FKs/defaults). **Ordering:** 120000 → 130000, both after 6D (110000).
- **Exercised on a disposable DB (2026-10-11):** columns dropped → both migrations applied (`ALTER TABLE`, exit 0) → columns re-created as `text nullable=YES`; re-apply emitted `NOTICE: column … already exists, skipping`.
- **Preflight queries:** confirm both tables exist; confirm both columns absent; check `pg_stat_activity` for long-running transactions before the catalog lock.
- **Post-migration verification:** `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE (table_name='story_scene_seeds' AND column_name='narrationScript') OR (table_name='story_projects' AND column_name='backgroundMusicUrl');` → `text`, nullable.
- **DBA judgment items:** confirm deploy ordering applies migrations before new code (deploy.yml runs `migrate deploy` before build); confirm no app instance caches the pre-migration column list. **No production approval claimed.**

---

## 5. FFmpeg validation arrangement

**Harness:** `packages/api/scripts/r16-render-validation.ts` (new this pass). It drives the **production** `renderOutputDerivative` pipeline with injected `fetch` (serves synthetic on-disk fixtures) and injected `upload` (persists the output buffer) — **no R2, no network, no DB, no live provider**.

- **Environment:** an approved isolated host with `ffmpeg` **and** `ffprobe` on PATH (this host has neither → currently BLOCKED).
- **Command:** `pnpm --filter @raivstream/api exec tsx scripts/r16-render-validation.ts` (exit `2` = ffmpeg absent, `0` = all pass, `1` = a check failed).
- **Asserts:** narration-only export has video+audio streams; narration+music export has video+audio and duration tracks narration; an unfetchable input rejects (failure handling); the renderer's temp dir is cleaned up.
- **Status:** harness written and verified to load and fail-closed (`exit 2`) on this host; the real-media assertions are **NOT TESTED** until run where ffmpeg exists. Unit-level coverage remains `render.test.ts` (7) + `storyVideoExport.test.ts` (5).

---

## 6. Deployment boundary (unchanged)

No push, no production migration, no credit-rate seeding, no live Lyria activation, no Phase 6E until the outstanding gates resolve and this exact candidate is reviewed. This pass made **no** production change and **no** commit.

**Files created/modified this pass (all local, uncommitted):** `packages/api/scripts/r16-render-validation.ts` (new), `docs/operations/r16-video-audio-staging-rehearsal.md` (this doc, new). No tracked file was modified.
