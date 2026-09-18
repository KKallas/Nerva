#!/bin/sh
# Copy the working tree to the server and restart Nerva, by hand. Pushing to
# main does the same through .github/workflows/deploy.yml; this is for trying
# something before it is committed.
#   bin/deploy.sh [user@host]
# Code lives in /opt/nerva (owned by the `deploy` user); data in /var/lib/nerva
# and the server's .env are never touched.
set -e
HOST="${1:-${NERVA_HOST:-deploy@134.209.94.101}}"
cd "$(dirname "$0")/.."

npm test

rsync -az --delete \
  --exclude node_modules --exclude data --exclude .env --exclude .git --exclude .github \
  --exclude '.DS_Store' --exclude '*.log' --exclude 'data-backup-*.zip' \
  ./ "$HOST:/opt/nerva/"

ssh "$HOST" 'cd /opt/nerva && npm ci --omit=dev --no-audit --no-fund && find . -path ./.env -prune -o -exec chmod g+rX {} + \
  && sudo -n systemctl restart nerva && sleep 2 && sudo -n systemctl is-active nerva'
