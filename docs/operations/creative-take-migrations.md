
## Creative-table migrations: run as `supabase_admin`, not `postgres` (2026-11-03)

`creative_produced_assets` is owned by **`supabase_admin`**. A migration run as `postgres` fails with
`ERROR: must be owner of table creative_produced_assets`, and the failure is easy to misread as "the migration
runner did not run" — the columns simply never appear.

**Route used:** `docker exec -i supabase-db psql -U supabase_admin -d postgres < migration.sql`. The deploy's
migration step runs as `postgres` and therefore cannot alter creative tables; every creative-table migration needs
this owner until the runner is changed.

**Second gotcha, found by applying it:** the take model's original unique constraint on
`("sceneId", "kind", "takeNumber")` is **impossible** — `sceneId` is only unique within a project, so two projects
that both have `SCENE_04` collide (`Key ("sceneId", kind, "takeNumber")=(SCENE_04, IMAGE, 1) is duplicated`). The
constraint must be `("projectId", "sceneId", "kind", "takeNumber")`. Schema and migration are both corrected.

**Third:** the generated Prisma client was already current for `takeNumber` (109 occurrences) — the "stale client"
assumption was wrong, and the `grep` that "proved" staleness earlier was looking at a path that does not exist on
this deployment. The only real gap was the columns.

## The first take (2026-11-03)

| measure | value |
|---|---|
| take | **2** (parent `cmuzaqou`, take 1) |
| demotion | take 1 → `isLatest=false`, `READY`; take 2 → `isLatest=true`, `READY` |
| framing | `framingInPrompt=true`, `references=4` |
| charge | **0** — **no `CreditTransaction` written** |
| score | old take **60**, new take **70** |

**The take raised the scene from 60 to 70 and still does not clear the floor of 75.** The below-floor tail is
therefore **partially actionable**: a take is a real improvement, and this scene is a measured ceiling at 70 with
conditioning rather than an un-conditioned artefact.

**The charge did not happen, and it failed silently.** `deductCredits` threw and `createNewTake`'s `.catch(() => 0)`
swallowed it — the project owner (`b08acceptance@test.raivstream.com`) has **no `CreditBalance` row** (`balance=-1`).
That is the same silent-zero pattern as `castReferences`, in the newest code path: a take must not report
`creditsCharged=0` as if it were a valid outcome.
