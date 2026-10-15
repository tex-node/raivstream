# Share-attribution retention (90-day)

Phase 4b — keeps `share_attributions` bounded without losing totals.

## What it does

`recoverShareAttributionRetention` (`packages/api/src/lib/story/shareAttributionRetention.ts`):

1. Rolls raw `share_attributions` older than **90 days** (`SHARE_ATTRIBUTION_RETENTION_DAYS`) into per-day counts in `share_link_daily_counts`.
2. Deletes the raw rows older than the window.

Idempotent: the upsert merges by the unique constraint and the delete only touches rows past the cutoff. Logs `[share.retention] aggregated=<n> deleted=<n>`.

## How it runs

- **Manually (admin):** `admin.runShareAttributionRetention` (adminProcedure) — same function.
- **CLI:** `pnpm --filter @raivstream/api share:retention` (`packages/api/scripts/share-retention.ts`) — no HTTP, no admin token; needs `DATABASE_URL` in the env.
- **Scheduled (daily, VPS):**
  ```
  17 3 * * * /bin/bash /root/raivstream/scripts/share-retention.sh >> /root/raivstream/share-retention.log 2>&1
  ```
  Wrapper `/root/raivstream/scripts/share-retention.sh` sets `PATH`, sources `DATABASE_URL` from `/root/raivstream/.env`, and runs the CLI. Modeled on the canary cron (`0 6 * * *` → `canary-status.sh` → `canary-status.log`).

## Operate

```bash
# run once by hand (no-op until there are >90-day-old rows)
cd /root/raivstream && export DATABASE_URL=$(grep '^DATABASE_URL=' /root/raivstream/.env | cut -d= -f2- | tr -d '"') \
  && pnpm --filter @raivstream/api share:retention

# what the cron last wrote
tail -n 20 /root/raivstream/share-retention.log

# crontab
crontab -l | grep share-retention
```

## Verify / rollback

- Check: `share_attributions` has no rows older than 90 days; `share_link_daily_counts` carries the rolled-up totals.
- Rollback: remove the one crontab line (`crontab -l | grep -v share-retention | crontab -`) and delete the wrapper. The aggregate rows are additive and safe to keep.

## Notes

- No IP is stored anywhere (`share_attributions` = `{id, shareLinkId, viewerUserId, createdAt}`) — a compliance invariant recorded in the `20261012190000_share_links` migration.
- Last verified 2026-10-15: CLI run `aggregated=0 deleted=0` (0 rows); cron installed.
