#!/usr/bin/env bash
# Per-boot startup for note-taker-3: ensure the local MongoDB daemon is running.
# Idempotent — tolerates an already-running mongod and returns once it is ready.
set -euo pipefail

cd "$(dirname "$0")/.."

sudo mkdir -p /data/db /var/log/mongodb
sudo chown -R "$(id -un)":"$(id -gn)" /data/db /var/log/mongodb 2>/dev/null || true

if pgrep -x mongod >/dev/null 2>&1; then
  echo "[start] mongod already running"
else
  echo "[start] Starting mongod"
  mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017 \
    --fork --logpath /var/log/mongodb/mongod.log
fi

# Wait until MongoDB accepts connections.
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    echo "[start] MongoDB is ready on 127.0.0.1:27017"
    exit 0
  fi
  sleep 1
done

echo "[start] ERROR: MongoDB did not become ready in time" >&2
exit 1
