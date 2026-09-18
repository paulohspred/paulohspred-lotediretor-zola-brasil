#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${NODE_BIN:-/srv/lotediretor-runtime/node-v18.16.0-linux-x64/bin}"
SERVICE_NAME="${SERVICE_NAME:-lotediretor-web.service}"

export PATH="$NODE_BIN:$PATH"
cd "$ROOT"

yarn build
sudo install -m 0644 infra/systemd/lotediretor-web.service "/etc/systemd/system/$SERVICE_NAME"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4200/healthz" >/dev/null; then
    curl -fsS "http://127.0.0.1:4200/healthz"
    printf '\n'
    exit 0
  fi
  sleep 1
done

sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
exit 1
