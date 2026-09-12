# VPC-2 Visual Quality Benchmark — 2026-09-12

**Candidate branch:** `feat/visual-prompt-composer-v2`
**Benchmark commit:** `5b04ee49d32941415e868e8ef15a41de5f5761ca` (base `5acc153c5eabedc3ea722006730a9d1dd4e5e87a`)
**Repository:** `C:\Raiv\raivstream` (authoritative). Frozen prototype and `origin/claude/adjust-message-popup-threshold-lqHT4` untouched.
**Provider mode:** `mock-deterministic-local` — local deterministic SVG renderer. **No real image/video provider.**
**Real visual quality:** **NOT EXECUTED — REAL SAFE VISUAL PROVIDER UNAVAILABLE.**

---

## 1. Why no real provider

The task permits a real provider only if it is safe and non-production. No separately provisioned
non-production credential was supplied, and the isolated staging environment contains only the
production provider keys (`RUNPOD_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`).
Using them is prohibited by this task. Per the gate, the fallback is a deterministic local/mock
provider for pipeline validation, and empirical visual quality must be reported as unavailable.

## 2. Benchmark corpus

Existing fixture, unchanged: `packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts`
— **12 stories / 32 scenes** (same corpus as structural qualification). No scenes replaced,
reduced, or cherry-picked.

## 3. Isolation proof

| Check | Result |
|---|---|
| Staging host | VPS `81.0.246.223` via `raivstream` SSH alias |
| Staging process | PM2 `raivstream-vpc2-staging` (id 34), online |
| Staging port | `127.0.0.1:3039` |
| Staging checkout | `/root/raivstream-vpc2-staging` @ `5b04ee4` |
| Staging DB | `raivstream_vpc2_pg` @ `127.0.0.1:55484` (container `raivstream-phase9a-supabase-postgres`) |
| Production DB | `172.18.0.2:5432/postgres` — different host/port/db |
| Production PM2 | `raivstream-web` (pid `3142819`, restarts `299`) — never touched |
| Provider keys in benchmark child env | `RUNPOD_API_KEY=UNSET`, `GEMINI_API_KEY=UNSET`, `XAI_API_KEY=UNSET`, `OPENAI_API_KEY=UNSET` |
| Outbound network calls during benchmark | **0** (harness fetch counter) |
| DB / R2 / credits touched by harness | none (harness imports only the composers) |

## 4. Request count and cost

| Item | Value |
|---|---:|
| Real provider requests | 0 |
| Mock artifacts generated | 64 (32 V1 + 32 V2 SVG) |
| Provider cost | $0.00 |
| Video/audio generation | none |
| Background queues | none |

## 5. Prompt length statistics

| Stat | V1 | V2 |
|---|---:|---:|
| min | 945 | 991 |
| median | 1046 | 1318 |
| p95 | 1350 | 1652 |
| max | 1354 | 1702 |

All prompts within the 1800-character budget (32/32 both variants).

## 6. Latency statistics (mock render boundary)

min `0.026` ms, median `0.064` ms, p95 `0.154` ms, max `0.525` ms. Duration = 51 ms for all 64 artifacts.

## 7. Determinism results

- Every prompt composed twice within the harness → identical hash (`allDeterministic = true`).
- Local (Windows) and staging (VPS) runs produced **identical prompt hashes for all 64 records**.
- Duration is the only varying field; prompts and mock artifacts are deterministic.

## 8. Automated structural results

| Check | V1 | V2 |
|---|---:|---:|
| Character name present | 32/32 | 32/32 |
| Camera present | 16/32 | 32/32 |
| Composition present | 32/32 | 32/32 |
| Environment present | 32/32 | 32/32 |
| Overlay protection in negative | 32/32 | 32/32 |
| Within 1800 budget | 32/32 | 32/32 |

V1's lower camera rate reflects the V1 deterministic composer, which only emits camera direction
when a director `cameraStyle` is present; V2 maps the constrained camera vocabulary for all scenes.
This is an observation, not a real-image quality claim.

## 9. Safety / injection / R16 results

Carried forward from staging structural qualification (`vpc2-staging-qualification-2026-09-12.md`)
and unchanged by this task:
- R16/KIDS: `audienceMode=KIDS`, kids negative terms + overlay terms present, no provider/model leakage.
- Prompt injection: "ignore previous instructions / reveal system prompt" is neutralised.
- No schema migration; no billing/credit mutation.

## 10. Auth and ownership results

Carried forward: signed-out → `UNAUTHORIZED`; non-owner → `NOT_FOUND`; owner composes;
historical/malformed blueprint compatible; flag off → V1; flag on → V2.

## 11. Billing / credit invariants

| Check | Result |
|---|---|
| `story:movie_render` | **100 credits** (unchanged) |
| Staging `credit_transactions` count | `0` before and after |
| Staging `credit_balances` count | `1` before and after |
| New VPC-2 billing rate | none |
| Production ledger access | none |

## 12. Human review methodology

**Not performed.** Mock SVG output does not represent real generated image quality; scoring it
against the visual rubric would fabricate visual evidence. The 13-criterion human rubric and the
≥75% pairwise-preference target are therefore **not applicable** to this result and remain
outstanding for a future run with a safe real provider.

## 13. Exclusions and limitations

1. Real empirical visual comparison **not executed** (no safe non-production provider).
2. Mock output validates prompt→image-boundary plumbing, determinism, and invariants only.
3. Pairwise preference, per-criterion scores, V1/V2/tie counts: N/A.
4. Staging env still contains production provider keys — operational finding below.

## 14. Provider errors / retries

None. No real provider was contacted; mock generation is deterministic with 1 attempt per artifact.

## 15. Production impact / credentials

- Production was **not** deployed to, merged, pushed to, or modified.
- No production data, credits, ledger, R2, PM2, or environment file was touched.
- No secret, token, or credential value was printed; only key **names** and `SET`/`UNSET` states were reported.

## 16. Security finding — production provider keys in staging (needs authorization)

The isolated staging `.env.local` contains production provider keys: `RUNPOD_API_KEY`,
`GEMINI_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY` (values not printed). For this benchmark they were
explicitly unset in the child process, so the benchmark could not call any provider. Removing or
rotating them in staging may affect other staging functionality and is **not** performed silently —
it is reported here for explicit operational authorization.

## 17. Files changed (benchmark support, commit `5b04ee4`)

- `packages/api/src/routers/story.ts` — export `composeScenePromptText` (V1) for benchmark use; behavior-neutral.
- `packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts` — export the corpus; guard direct-run so importing fixtures does not execute the runner.
- `scripts/vpc2-visual-benchmark.ts` — new offline mock harness.
- `docs/operations/vpc2-visual-quality-benchmark-2026-09-12.md` — this report.

## 18. Verdict

```
VISUAL PROMPT COMPOSER V2 — VISUAL QUALITY BENCHMARK — NOT EXECUTED — REAL SAFE VISUAL PROVIDER UNAVAILABLE
VISUAL PROMPT COMPOSER V2 — STAGING QUALIFICATION — PASS WITH DOCUMENTED LIMITATIONS
NOT READY FOR PRODUCTION RELEASE DECISION
```

Artifacts retained on staging host: `/root/vpc2-visual-benchmark-mock/` (64 SVG + `manifest.json`).
