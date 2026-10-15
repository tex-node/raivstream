# VPS change rules (hard rules)

The VPS (`81.0.246.223`, ssh alias `raivstream`) hosts **other businesses' jobs and
services**, not just Raivstream. Treat anything outside `/root/raivstream` as
**read-only** unless the owner explicitly approves a change to it.

These rules exist because a 2026-10-15 crontab edit briefly installed an **empty
crontab** (a PowerShell→ssh multi-line quoting error wrote an empty temp file, then
`crontab <file>`). It was caught and restored within ~1 minute and no job missed a run,
but the blast radius could have included unrelated businesses.

## Crontab — always back up, edit a file, validate, install once

```bash
# 1. BACKUP first (never edit the live crontab directly)
mkdir -p /root/backups
crontab -l > /root/backups/crontab.$(date +%Y%m%d-%H%M%S)

# 2. Build the new crontab as a FILE (do not pipe multi-line content from PowerShell)
cp /root/backups/crontab.<ts> /root/backups/crontab.new
#   append/remove lines with a single heredoc over ssh, or scp a prepared file:
printf '%s\n' '<the new cron line>' >> /root/backups/crontab.new

# 3. VALIDATE before installing
wc -l /root/backups/crontab.<ts> /root/backups/crontab.new        # expected line count
cat -A /root/backups/crontab.new                                  # no CR (^M), no stray chars
diff /root/backups/crontab.<ts> /root/backups/crontab.new         # only the intended change

# 4. INSTALL ONCE
crontab /root/backups/crontab.new
crontab -l | diff - /root/backups/crontab.new && echo "crontab matches"
```

Never: pipe multi-line content from PowerShell into `crontab -`; chain an edit whose
failure would leave an empty temp file; run `crontab` more than once per change.

## Same pattern for any shared VPS config

For **`.env`, `Caddyfile`, PM2 ecosystem, nginx/systemd units** and anything else
outside `/root/raivstream`:

1. Back up first: `cp <file> /root/backups/<name>.$(date +%Y%m%d-%H%M%S)`.
2. Write the new content to a temp file (single heredoc over ssh, or scp).
3. Validate (diff against the backup; `cat -A` for hidden CRs).
4. Apply once; verify (re-read + diff).
5. Keep the backup until the change is confirmed good.

## Scope

- Under `/root/raivstream`: changes are allowed per the task's approval (still back up
  shared config).
- Outside `/root/raivstream` (other businesses, shared services): **read-only** unless
  explicitly approved for that action.
- Scheduled jobs (`crontab`, systemd timers, other PM2 apps) are shared infrastructure —
  any change follows the backup → file → validate → install-once pattern above.

Last incident: 2026-10-15 (empty-crontab window ≈ 08:46:30–08:47:10 CEST; restored from
the captured original; verified 6 lines, no CR; no scheduled run missed — chart-bridge
ran at 08:45 and 08:50, covering the window).
