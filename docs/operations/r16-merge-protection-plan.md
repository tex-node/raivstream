# R16 — Merge-Protection Plan for `main` (required CI checks)

**Date:** 2026-10-11
**Prepared by:** read-only audit + configuration preparation (no settings changed)
**Repo:** `tex-node/raivstream` (public) · worktree `C:\Raiv\raivstream`
**Baseline:** `main` @ `9d8ca17` (local) / `a9cb10f` (origin) · branch `ci/r16-test-gates` @ `0a7c865` · draft PR **#2**

> This document prepares the configuration only. **No repository setting, ruleset, or branch-protection change was made.** Enforcement is not yet active.

---

## 1. Repository & PR state (verified 2026-10-11)

| Item | Value |
|---|---|
| `main` (local) | `9d8ca179d79c84de8712ba0740d1276861d98a56` — **untouched** |
| `origin/main` | `a9cb10ff1d83c92d82e5223b559a3100c2b736a7` — **no push to main** |
| Current branch | `ci/r16-test-gates` @ `0a7c86567ddeed303a33f2feca29fad86d9d3e4a` |
| PR #2 | **OPEN · draft · base `main` · head `ci/r16-test-gates` · `mergeStateStatus=CLEAN` · `MERGEABLE`** |
| PR #2 ancestry | 7 commits ahead of `origin/main`: the 5 unpushed R16 commits (`6b3989f…9d8ca17`) + 2 CI commits (`81c5d0f`, `0a7c865`) |
| Hosted unit job | **success** — `Test Files 82 passed (82)`, `Tests 1550 passed | 5 skipped (1555)` (run 38180537650) |
| Hosted integration job | **success** — index predicate verified, `race=20/20`, counts `4/4/0/0/0`, no skip marker |
| R16 candidate changes | **preserved** (still uncommitted: `story.ts`, `phase6d.integration.test.ts`, narration helper/test, `.claude/settings.local.json`, `SESSION.md`↔`session.md`, untracked docs/UI) |

**Note:** PR #2 is *not* CI-files-only in diff terms — because the branch is based on local `main` (which is 5 commits ahead of `origin/main`), the PR diff includes the unpushed R16 candidate commits as ancestry. The two CI commits themselves contain only CI files.

---

## 2. Exact required check names

Obtained from the check-runs API on the PR head (`app = github-actions`), not guessed:

| Required check context | Source job | Workflow |
|---|---|---|
| `API unit tests` | `test-unit` (`name: API unit tests`) | `ci.yml` (PR) |
| `API integration tests (real PostgreSQL)` | `test-integration` (`name: API integration tests (real PostgreSQL)`) | `ci.yml` (PR) |

- Both are emitted by **`ci.yml`** on `pull_request`; the same names also exist in `deploy.yml` (push-to-main), but that workflow does **not** run on PRs, so it does not supply/conflict with PR checks.
- These strings must remain stable: renaming either job in `ci.yml` would make the required check permanently "missing" and block all PRs.

---

## 3. Current protection / ruleset findings

- **Classic branch protection on `main`:** **none** — `GET /branches/main/protection` → HTTP 404; `/branches/main` → `"protected": false`.
- **Repository rulesets:** **none** — `GET /repos/.../rulesets` → `[]`.
- **Organization rulesets/plan:** not readable with the current token (`GET /orgs/tex-node` → 404; requires `admin:org`). **Not needed**: the repo is **public**, so branch protection **and** rulesets are available on the free plan — no plan constraint.
- **Repo merge settings:** merge/squash/rebase all allowed; `allow_auto_merge=false`.
- **My token permissions:** `admin:true, maintain:true, push:true, pull:true, triage:true` — I *could* change protection/rulesets, but this task does **not** authorize it.

---

## 4. Proposed enforcement configuration (prepared, NOT applied)

Intended policy: a PR cannot merge into `main` unless **both** required checks pass; failed/pending/missing checks block; PRs are required (no direct pushes); production deployment stays a separate push-triggered workflow; no unrelated checks required.

### Option A (recommended) — repository **ruleset**

Rulesets are the modern mechanism: multiple rules, bypass actors, audit history, and they can also require workflows. Equivalent to classic protection for this use case, with better governance.

```
POST /repos/tex-node/raivstream/rulesets
{
  "name": "main-required-checks",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "pull_request",
      "parameters": { "required_approving_review_count": 0,
                      "dismiss_stale_reviews_on_push": false,
                      "require_code_owner_review": false,
                      "require_last_push_approval": false,
                      "required_review_thread_resolution": false } },
    { "type": "required_status_checks",
      "parameters": { "strict_required_status_checks_policy": true,
                      "required_status_checks": [
                        { "context": "API unit tests" },
                        { "context": "API integration tests (real PostgreSQL)" } ] } },
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
```

### Option B (equivalent) — classic branch protection

```
PUT /repos/tex-node/raivstream/branches/main/protection
{
  "required_status_checks": { "strict": true,
    "contexts": ["API unit tests", "API integration tests (real PostgreSQL)"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

### Trade-offs

| | Ruleset (A) | Classic protection (B) |
|---|---|---|
| Modern / auditable | ✅ layered, org+repo, bypass actors | ⚠️ single-branch, legacy |
| Required checks | ✅ `required_status_checks` | ✅ `required_status_checks` |
| Require PRs (block direct push) | ✅ `pull_request` rule (0 approvals) | ✅ `required_pull_request_reviews` |
| Force-push/delete protection | ✅ | ✅ |
| Required *workflows* (extra) | ✅ supported | ❌ |
| Availability (public repo) | ✅ free | ✅ free |

`strict_required_status_checks_policy: true` requires the PR branch to be up to date with `main` before merging (prevents merging stale green checks). Set to `false` if that friction is undesired; recommended `true`.

---

## 5. Validation method & evidence

**No public GitHub "ruleset dry-run / evaluation" API exists**, so enforcement **cannot** be proven before it is enabled. Validation is therefore two-part:

### 5.1 Available now (static analysis — evidence-based)
- Exact required check **names exist and pass** on the PR head (`gh pr checks 2`, check-runs API): `API unit tests` = pass, `API integration tests (real PostgreSQL)` = pass.
- `ci.yml` triggers on `pull_request` only (plus `workflow_dispatch`) and contains **no deploy job/secrets** — the non-deploying PR workflow is confirmed (parity + isolation checks).
- The deploy workflow is `push:[main]`-only; the PR runs only `CI (tests)` (observed: run 38180537650 was `pull_request`; no `Deploy to VPS` run was created).
- GitHub's documented semantics: with required status checks, a PR whose required contexts are failing/pending/absent shows `mergeStateStatus=BLOCKED` and the merge button is disabled; a direct push to a protected/ruleset branch is rejected.

### 5.2 Post-enablement observation plan (requires authorization)
1. Re-open PR #2 (or any PR) → confirm `mergeStateStatus` stays `CLEAN` with both checks green.
2. Observe blocking using an **already-existing** non-passing state where possible; **do not** create a deliberately failing PR or alter app code (not authorized). A safe option is to add a temporary *non-required* failing check only if later authorized.
3. Attempt a direct `git push origin HEAD:main` (dry-run/`--dry-run` is not supported by GitHub) → the API/remote rejects it once the PR rule is active.
4. Record the observed `mergeStateStatus`/merge-button state as the enforcement evidence.

**Do not claim actual merge-blocking was tested** until step 5.2 is executed after enablement.

---

## 6. Proven vs inferred / untested

| Claim | Status |
|---|---|
| `main` unprotected; no rulesets | **Proven** (API) |
| Exact required check names + both pass on PR head | **Proven** (API) |
| `ci.yml` is non-deploying; deploy is push-main only | **Proven** (static + hosted runs) |
| Repo is public; admin token; free-plan availability | **Proven** (API) |
| A failing/pending/missing required check blocks merge | **Inferred** (GitHub documented semantics) — **not** observed |
| Direct push to `main` blocked once enabled | **Inferred** — **not** observed |
| Ruleset JSON is accepted by GitHub | **Untested** (not applied) |

---

## 7. Approval / permissions required

- **Approval needed:** authorization to change repository settings (create the ruleset / enable branch protection). No additional GitHub **scope** is required — the current token already has repo `admin`.
- Optional: `admin:org` scope if an **organization-level** ruleset is preferred over a repo-level one (currently unreadable → not required for repo-level enforcement).
- No permission blocker for the repo-level ruleset.

---

## 8. CI duplication assessment (reusable workflow)

**Current state:** `test-unit` and `test-integration` are duplicated (byte-identical) in `ci.yml` and `deploy.yml` (parity verified).

**Proposed architecture (separate plan, NOT done here):**
```
tests.yml            (on: workflow_call)  → jobs: test-unit, test-integration
ci.yml               (on: pull_request, workflow_dispatch) → job tests: uses ./tests.yml
deploy.yml           (on: push:[main]) → job tests: uses ./tests.yml ; deploy: needs: [tests]
```
- **Equivalent?** Permissions: none required. Service containers (postgres) are supported in reusable workflows. Artifacts: none used. Failure behavior: a reusable-workflow failure fails the caller job → `needs` still blocks deploy.
- **Key caveat:** `deploy.needs` changes from `[test-unit, test-integration]` to `[tests]`, and **the emitted check names must be re-verified** — if the inner job names/contexts change, the required status checks would break. Do **not** refactor before merge protection is configured, and re-confirm the exact check contexts after any refactor.
- **Necessary before merge protection?** **No.** Defer; present as a follow-up with its own validation.

---

## 9. Recommended next action

1. **Authorize the settings change**, then apply **Option A (ruleset)** with required contexts `API unit tests` and `API integration tests (real PostgreSQL)`, `strict_required_status_checks_policy: true`, a `pull_request` rule (0 approvals), and `deletion`/`non_fast_forward` protection.
2. After enablement, execute the §5.2 observation plan and record `mergeStateStatus` evidence.
3. Separately decide PR #2's scope (it currently carries the 5 unpushed R16 commits as ancestry) before any merge.
4. Optionally, later: reusable-workflow refactor with check-name re-verification.

**Stopped here. No settings changed, no merge, no push, no deploy.**
