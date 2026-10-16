# Environment layout (production + staging)

**Status:** verified 2026-10-16 against the production VPS (`/root/raivstream`, deployed `main` `46dbf0c`).

This document is the source of truth for **which process reads which env file**. It supersedes any
older note claiming `apps/web/.env.local` is a symlink.

## Production — process → env file

| Process | Reads | Notes |
|---|---|---|
| `raivstream-web` (PM2 id 0, `next start`, cwd `/root/raivstream/apps/web`) | **`apps/web/.env.local`** | Next.js loads it at server start (dotenv semantics). The deploy also `source`s it into the shell before `pm2 restart --update-env` (`deploy.yml`). **Flag changes for the running web app go here.** |
| Prisma CLI (`migrate deploy`, `db:generate`, scripts) and cron/scripts | **`/root/raivstream/.env`** | Reached in the web checkout via the symlink `packages/database/.env -> /root/raivstream/.env`. |

**Not symlinks in production:** `apps/web/.env.local` is a real, standalone file. Only
`packages/database/.env` is a symlink (to the root `.env`).

**Consequence:** editing `/root/raivstream/.env` does **not** change what the Next server sees.
A web-facing flag/allowlist must be set in `apps/web/.env.local`, then
`set -a; source apps/web/.env.local; set +a; pm2 restart raivstream-web --update-env`.
Editing only the root `.env` (and restarting) leaves the web process unchanged — this caused the
2026-10-16 `STORY_PACE_USER_IDS` allowlist not to take effect.

## Staging equivalents

Each staging checkout has its own real files (never symlinked to production — this is the control
that prevents a staging process from writing to the production DB):
`/root/raivstream-<feature>-staging/apps/web/.env.local` and
`/root/raivstream-<feature>-staging/packages/database/.env`.
A repo-wide `find … -type l` outside `node_modules` should show **zero** symlinks in a staging
checkout.

## Health / liveness — canonical URLs

- **Production web health (use this):** `https://app.raivstream.com/api/health`
- R16 (same app): `https://r16.raivstream.com/api/health`
- `https://raivstream.com/api/health` and `https://db.raivstream.com` are **not** the app health
  endpoint (the apex host 404s) — do not use them for deploy/incident checks.

## Known divergence / hygiene

- Duplicate or malformed keys in `apps/web/.env.local` are a hazard: because the deploy `source`s
  the file in bash, a malformed line (e.g. a value containing an unquoted space) prints
  `…: command not found` and that one variable is not exported. Next still parses the file with
  dotenv, so the two processes can disagree. Fix the line; do not rely on the shell error.
- `XAI_API_KEY` was duplicated in `apps/web/.env.local` (one malformed); deduped 2026-10-16. xAI is
  being retired — remove the key entirely in the model-retirement PR.
- `FAL_MAX_REQUESTS` historically diverged (root `.env` vs `.env.local`); the running web process
  uses the `.env.local` value.
