#!/usr/bin/env bash
set -euo pipefail

npm install

# electron@43 ships no postinstall script, so npm never fetches its binary.
# Without this, `npm run gui:dev` fails with "Error: Electron uninstall".
if [ -f node_modules/electron/install.js ] && [ ! -d node_modules/electron/dist ]; then
  node node_modules/electron/install.js
fi

for f in .env .env.local; do
  if [ -f "$SUPERSET_ROOT_PATH/$f" ] && [ ! -f "$f" ]; then
    cp "$SUPERSET_ROOT_PATH/$f" "$f"
  fi
done
