# VPC-2 Human Review — 2026-09-05

Branch: `feat/visual-prompt-composer-v2`  
Reviewed commit: `02be6de` plus local review-gate refinements  
Scope: Visual Prompt Composer V2 local qualification only  
Deployment: none

## Summary

The human review gate required at least six benchmark stories to be reviewed manually against the 10-dimension rubric in `docs/operations/vpc2-visual-prompt-composer-v2.md`.

Result: **PASS**

Average score across reviewed stories: **4.92 / 5.00**  
Threshold: **>= 4.00 / 5.00**

No paid generation was triggered. The review used deterministic prompt text only.

## Stories Reviewed

| Story | Audience | Style | Scenes | Average |
|---|---:|---|---:|---:|
| `b01` Max Goes to School | KIDS | Storybook Illustration | 3 | 4.9 |
| `b02` Kofi Learns to Swim | KIDS | African Folktale Illustration | 3 | 5.0 |
| `b04` Reconciliation | GENERAL | Photorealistic | 3 | 4.8 |
| `b05` The Festival Sisters | GENERAL | Three D Animated | 3 | 5.0 |
| `b08` The Adventure | GENERAL | Cinematic Fantasy | 3 | 5.0 |
| `b10` The Mystery Map | GENERAL | Watercolor | 3 | 4.8 |

## Rubric Scores

Scores are 1-5.

| Dimension | b01 | b02 | b04 | b05 | b08 | b10 | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| Character identity retention | 5 | 5 | 5 | 5 | 5 | 5 | Names, species/age/gender where present, physical traits, and signature items are preserved. |
| Action retention | 5 | 5 | 5 | 5 | 5 | 5 | Scene actions are directly present and clear. |
| Environment specificity | 5 | 5 | 5 | 5 | 5 | 5 | Locations remain scene-specific. |
| Camera presence | 5 | 5 | 5 | 5 | 5 | 5 | Camera terms are present for all reviewed scenes. |
| Composition | 5 | 5 | 4 | 5 | 5 | 5 | Human review found one risk: multi-character projects could imply offscreen characters. Composer was tightened to distinguish depicted characters from continuity references. |
| Continuity | 5 | 5 | 5 | 5 | 5 | 5 | Character identity continuity is explicit in every reviewed prompt. |
| Style preservation | 5 | 5 | 5 | 5 | 5 | 5 | Style blocks match requested visual style. |
| Required-detail retention | 5 | 5 | 5 | 5 | 5 | 4 | Important props are retained. `b10` keeps the map but does not always retain the magnifying glass as a named required detail. |
| Forbidden-detail absence | 5 | 5 | 5 | 5 | 5 | 5 | Positive prompts avoid UI, watermark, subtitle, and provider/debug language. |
| Overlay protection in negative | 5 | 5 | 5 | 5 | 5 | 5 | Negative prompts include overlay/UI protections. |

## Review-Gate Refinement

During manual review, `b04` showed a quality risk: when a project has multiple characters but a scene action mentions only one, the prompt still included every character identity lock in the required character block. That is useful for consistency but can cause image models to draw offscreen characters.

Refinement applied:

- Character identity locks are still preserved.
- The prompt now adds explicit depiction guidance when scene-relevant names are known or inferred from the action.
- Composition now uses depicted-character count rather than total character-memory count.
- Group-action wording such as `entire class` still produces group framing.

New regression coverage:

- A scene with `Amadi` and `Tobi` in the project but only `Amadi` in the action now says `Depict in this scene: Amadi`.
- The same scene no longer requests two-shot composition.

## Benchmark

Command:

```bash
node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts
```

Result after refinement:

| Metric | Result |
|---|---:|
| Character identity in prompt | 100.0% |
| Required action present | 100.0% |
| Environment specific | 100.0% |
| Camera term present | 100.0% |
| Composition present | 100.0% |
| Continuity rules present | 100.0% |
| Style preserved | 100.0% |
| Overlay protection in negative | 100.0% |
| Median latency | 0.44ms |
| p95 latency | 2.00ms |
| Composer provider cost | $0 |

Gate targets: **ALL MET**

The prompt-body capture used:

```bash
VPC2_PRINT_PROMPTS=true node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts
```

Captured output: `docs/operations/vpc2-human-review-output.txt`

## Known Residual Risks

- StoryBlueprint continuity is still not threaded from `StoryChapter.blueprint` into `composeEnhancedScenePrompt`; the composer accepts it, but the router currently passes `null`.
- Conflict detection still has keyword false positives for phrases like `school gate` and `front door of home`. These remain non-fatal.
- No staging or production deployment is authorized by this review.

## Gate Status

Human review gate: **PASS**  
Automated benchmark gate: **PASS**  
Deployment gate: **NOT REQUESTED / NOT AUTHORIZED**
