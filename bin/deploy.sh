#!/bin/sh
# Copy the working tree to the server and restart Nerva.
#   bin/deploy.sh [user@host]
# Code lives in /opt/nerva; data lives in /var/lib/nerva and is never touched.
set -e
HOST="${1:-${NERVA_HOST:-root@134.209.94.101}}"
cd "$(dirname "$0")/.."

npm test

rsync -az --delete \
  --exclude node_modules --exclude data --exclude .env --exclude .git \
  --exclude '.DS_Store' --exclude '*.log' --exclude 'data-backup-*.zip' \
  ./ "$HOST:/opt/nerva/"

ssh "$HOST" 'cd /opt/nerva && npm ci --omit=dev --no-audit --no-fund \
  && chown -R nerva:nerva /opt/nerva && systemctl restart nerva \
  && sleep 2 && systemctl is-active nerva'
