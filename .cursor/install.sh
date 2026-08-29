#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for note-taker-3.
# Installs MongoDB (system package), Node dependencies for the API and the
# React UI, and writes a local dev .env when one is not already present.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- MongoDB (local dev database) ---
if ! command -v mongod >/dev/null 2>&1; then
  echo "[install] Installing MongoDB 8.0 community server"
  sudo apt-get update
  sudo apt-get install -y gnupg curl
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  sudo apt-get update
  sudo apt-get install -y mongodb-org
else
  echo "[install] MongoDB already installed: $(mongod --version | head -1)"
fi

sudo mkdir -p /data/db /var/log/mongodb
sudo chown -R "$(id -un)":"$(id -gn)" /data/db /var/log/mongodb

# --- Node dependencies ---
echo "[install] Installing API dependencies (repo root)"
npm ci

echo "[install] Installing React UI dependencies (note-taker-ui)"
npm --prefix note-taker-ui install

# --- Local dev environment file ---
# .env is gitignored. Seed a safe local config with AI disabled so no external
# secrets (Hugging Face / OpenRouter) are required to run the stack.
if [ ! -f .env ]; then
  echo "[install] Writing local dev .env"
  cat > .env <<'EOF'
## Local Cloud Agent dev environment
PORT=5500
JWT_SECRET=local_dev_secret_change_me
MONGODB_URI=mongodb://127.0.0.1:27017/note-taker

## AI disabled locally (no external Hugging Face / OpenRouter secrets required)
AI_ENABLED=false
AI_GENERATION_ENABLED=false

## Analytics safe local defaults
ANALYTICS_ENABLED=false

## Background workers off by default for a calm local boot
WIKI_STORAGE_GOVERNOR_RUN_ON_START=false
READING_WATCH_RUN_ON_START=false
MORNING_PAPER_EMAIL_RUN_ON_START=false
EMAIL_DISABLED=true
EOF
else
  echo "[install] Existing .env left untouched"
fi

echo "[install] Done."
