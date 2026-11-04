# Database migration ownership and history (2026-11-04)

## Two facts that cost two sessions to establish

### 1. The pipeline already connects as the owner

| credential | role | owns |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | **`supabase_admin`** | every table: `creative_produced_assets`, `story_scene_assets`, `character_reference_assets`, `creative_review_runs`, `story_video_exports`, `videos`, `users`, … |

`prisma migrate deploy` therefore **can** alter the creative and story tables. The
`ERROR: must be owner of table creative_produced_assets` seen twice in this project's history came
from running `psql -U postgres` **by hand** — a different role from the one the deploy uses. It was
never a pipeline limitation.

The other role in the cluster, `postgres`, is **not** a superuser here and owns nothing — so hand
runs against creative tables must use either `supabase_admin` or `docker exec … psql -U postgres`
only for reads.

### 2. There is exactly one migration history, and it is `packages/database/migrations`

```
packages/database/migrations        ← what Prisma reads (85 migrations)
packages/database/schema.prisma     ← the schema it belongs to
```

`prisma migrate status` reports *"N migrations found in prisma/migrations"* relative to the
**schema's directory** — `packages/database/` — which is why the path is `packages/database/migrations`
and **not** `packages/database/prisma/migrations`.

Two migrations (`20261103190000_creative_take_model`, `20261104020000_story_scene_asset_scope`) were
authored into `packages/database/prisma/migrations`, a directory Prisma never reads. Consequences,
all of which were observed before the cause was found:

- `prisma migrate status` truthfully said **"Database schema is up to date"**;
- `_prisma_migrations` had **no rows** for either migration;
- their effects existed anyway, because they had been applied **by hand**;
- the ledger and the schema disagreed, and only a `pg_indexes` / `information_schema` read showed it.

They have been moved into the real history. Their SQL is idempotent (`IF NOT EXISTS`, `DROP … IF
EXISTS`, guarded `DO $$ … $$`), so the pipeline can apply them safely on top of the hand-applied
state.

## The rule for the record

**A migration applied by hand is a migration the pipeline cannot reproduce.** If a migration must be
applied outside `prisma migrate deploy`, the ledger no longer describes the database, and the next
person cannot tell a missing migration from an applied one without querying the schema directly.

Practical checks, in order:

1. `ls packages/database/migrations | wc -l` — is the migration in the directory Prisma reads?
2. `prisma migrate status` — does it see it as pending?
3. after a deploy, `SELECT migration_name, finished_at FROM _prisma_migrations` — is it recorded?
4. `information_schema.columns` / `pg_indexes` — **does the effect exist?** The migration's exit code
   is not the state, and neither is its ledger row.