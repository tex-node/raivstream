# Raivstream 5.0 — UX Acceptance Sessions (Gate 5)

**Status: HUMAN ACCEPTANCE PENDING.** No sessions have been run. This document is the runnable protocol and the recording instrument. Do not mark any session `PASS` without an actual recorded session.

This gate cannot be automated or substituted by tests. It must be performed with representative, untrained creators.

---

## 1. Participants

Run one session per persona (minimum):

| Journey | Persona | Starting brief |
|---|---|---|
| A | Storyteller / Filmmaker | “Create a 5-minute photorealistic short film about a young Nigerian woman returning home after 10 years abroad and confronting her mother.” |
| B | Educator / Parent | “Create a 3-minute lesson explaining photosynthesis to eight-year-olds.” |
| C | Professional Content Studio | “Create a 30-second launch campaign for a new skincare product.” |

Prefer participants who have **not** been trained on Raivstream's architecture. Do **not** explain how it works.

## 2. Facilitator rules

- Give only the starting brief. No product walkthrough.
- Observe silently; only intervene if the participant is blocked for >60s, and record the intervention.
- Record verbatim quotes where possible. Do not convert to numeric scores.

## 3. Per-journey observation checklist

**A — Storyteller**
- [ ] Begins creation naturally
- [ ] Expresses intent without a technical prompt
- [ ] Understands “Here’s what I understand”
- [ ] Corrects an interpretation
- [ ] Understands the Creative Bible (only if opened)
- [ ] Understands the plan
- [ ] Understands Preview
- [ ] Approves production
- [ ] Understands production progress (stage checklist)
- [ ] Reviews the result
- [ ] Directs a change naturally
- [ ] Understands what will change
- [ ] Understands what will be preserved
- [ ] Understands impact
- [ ] Applies a correction
- [ ] Approves the resulting version
- [ ] Produces an output

**B — Educator**
- [ ] Audience understanding · [ ] Educational intent · [ ] Appropriate structure · [ ] User control · [ ] Review comprehension · [ ] Direct interaction · [ ] Approval comprehension · [ ] Output comprehension
- Never needs: model/provider selection, prompt construction, manifests, I2V/V2V, FFmpeg.

**C — Professional Studio**
- [ ] Brand context understandable · [ ] Product context understandable · [ ] Campaign context understandable · [ ] Inherited context reflected appropriately · [ ] Director interactions semantic · [ ] Versions understandable · [ ] Outputs understandable

## 4. Debrief questions (ask after each journey)

**Understanding:** 1) What did you think Raivstream understood about your idea? 2) Did you understand what it was going to make? 3) Was anything important missing?
**Control:** 4) Did you feel you were directing the creation? 5) Could you easily change something? 6) Did you understand what would change? 7) Did you understand what would stay the same?
**Complexity:** 8) Did you ever feel you needed to understand how the AI worked? 9) Did you feel you needed to write a better prompt? 10) Did anything feel unnecessarily technical?
**Trust:** 11) Before production, did you understand what would be created? 12) Did Preview give you enough confidence? 13) After generation, did you understand how to fix something you disliked?
**Overall:** 14) What was confusing? 15) What did you expect that did not happen? 16) What surprised you positively? 17) What would you change?

## 5. Acceptance criteria

Gate 5 passes when, across the sessions:
- creators complete the primary journey without technical instruction;
- creators can restate what Raivstream interpreted;
- creators understand the plan, review findings, and approval;
- creators direct semantic changes and understand change/preserve/impact;
- creators recover from an unwanted result via Direct;
- creators never need JSON, advanced prompting, providers, models or production infrastructure.

## 6. Recording

Record each session in `docs/operations/launch-closure-evidence.json` → `humanUx.sessions[]` (participant, date, result, notes), set `humanUx.status` and `humanUx.acceptanceCriteriaMet`, and set `facilitator`/`date`.

Then run:
```bash
pnpm exec tsx scripts/launch-closure-check.ts
```
The final GO decision is produced only when all three closure records are complete.
