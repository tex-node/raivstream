# Request: update `/opt/supabase-project` compose (watchdog source of truth)

**Owner action required. Do not change the watchdog.** This is a request, not a change.

## Why

`/usr/local/bin/supabase-bainsbridge-watchdog.sh` (cron `*/5 * * * *`) reconciles
containers from:

```
COMPOSE_DIR=/opt/supabase-project
docker compose up -d --remove-orphans
```

That directory — **not** `/root/supabase/docker` — is the effective source of truth
for the running Supabase stack. Two problems stem from its port bindings:

### 1. Kong is exposed to the internet
`/opt/supabase-project` binds Kong on `0.0.0.0:8000` / `0.0.0.0:8443`, so
`db.raivstream.com`'s gateway is reachable directly from the internet. Requested:

```yaml
# kong
ports:
  - "127.0.0.1:8000:8000/tcp"
  - "127.0.0.1:8443:8443/tcp"
```

Caddy is a **host process** and proxies `db.raivstream.com` →
`reverse_proxy localhost:8000`, so loopback binds keep `db.raivstream.com` working.
(Defense-in-depth `DOCKER-USER` iptables rules are already in place, so the ports are
blocked externally *today*; this makes it correct at the source.)

### 2. The pooler steals port 5432 and breaks the Raivstream app
`/opt/supabase-project` binds the pooler (`supavisor`) on `0.0.0.0:5432`, which
conflicts with the db's `127.0.0.1:5432`. Whichever binds first wins; the watchdog
keeps the pooler alive, so the **db loses 5432** and the Raivstream web app (which
connects to `127.0.0.1:5432`) hits the pooler and fails with
`FATAL: Tenant or user not found` — the app degrades every ~5 minutes.

Requested — the pooler must **not** publish 5432 (the db owns it), and 6543 should be
loopback:

```yaml
# supavisor
ports:
  - "127.0.0.1:6543:6543/tcp"      # drop the ${POSTGRES_PORT}:5432 publish entirely
```

The runbook already records the intended state: *"Supavisor/pooler is stopped because
it was occupying host 5432."* The Raivstream app does not use the pooler.

## Impact if left as-is
- `db.raivstream.com` is reachable directly on 8000/8443 from the internet (mitigated
  by iptables, not persisted across reboot).
- The Raivstream app degrades every ~5 minutes (pooler takes 5432).

## After the change
- The `DOCKER-USER` iptables rules for 8000/8443 can be removed.
- The app stops flapping; `db.raivstream.com` keeps returning 401 (auth-gated).

No rush on the timing — the iptables rules are the current protection for Kong — but
the **app flapping is user-visible** and worth prioritising.
