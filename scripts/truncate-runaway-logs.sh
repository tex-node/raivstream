#!/usr/bin/env bash
#
# Stopgap for unbounded Docker container logging.
#
# Why this exists: on 2026-10-28 the host ran out of disk (193G/193G) because one
# container's json log reached 61 GB. Postgres exited, the API returned 503, and
# a paid render was stranded for 7 hours. Docker's default log driver has NO size
# limit unless `log-opts` are configured per container, so any noisy service can
# silently consume the whole disk.
#
# This truncates the log files of containers that are already running. It does
# not rotate: the file keeps its inode, so the container keeps writing to the
# same handle and nothing breaks. History is lost, which is the point.
#
# Preferred fix (requires recreating the container, so it needs the owner's
# agreement for containers we do not run):
#   docker run --log-opt max-size=50m --log-opt max-file=3 ...
# or in the service's compose file:
#   logging:
#     driver: json-file
#     options: { max-size: "50m", max-file: "3" }
#
# Install (root crontab):
#   0 3 * * * /root/raivstream/scripts/truncate-runaway-logs.sh >> /var/log/truncate-docker-logs.log 2>&1
#
set -euo pipefail

THRESHOLD_BYTES=$((5 * 1024 * 1024 * 1024)) # 5 GiB
LOG_GLOB="/var/lib/docker/containers/*/*-json.log"

echo "[$(date -u +%FT%TZ)] scanning for container logs over 5 GiB"

found=0
for log in $LOG_GLOB; do
  [ -f "$log" ] || continue
  size=$(stat -c%s "$log" 2>/dev/null || echo 0)
  if [ "$size" -le "$THRESHOLD_BYTES" ]; then
    continue
  fi

  found=$((found + 1))
  container=$(basename "$(dirname "$log")")
  human=$(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")
  echo "[$(date -u +%FT%TZ)] truncating $container (${human})"
  truncate -s 0 "$log"
done

if [ "$found" -eq 0 ]; then
  echo "[$(date -u +%FT%TZ)] nothing over threshold"
else
  echo "[$(date -u +%FT%TZ)] truncated ${found} log(s)"
fi

df -h / | tail -1
