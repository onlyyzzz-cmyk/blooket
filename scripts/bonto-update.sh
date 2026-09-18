#!/bin/sh
# Direct file updater for Bonto - no git involved.
# Run:  curl -fsSL https://raw.githubusercontent.com/onlyyzzz-cmyk/blooket/main/scripts/bonto-update.sh | sh
set -e
BASE="https://raw.githubusercontent.com/onlyyzzz-cmyk/blooket/main"
cd /app

for f in index.js package.json public/index.html public/chats.html public/styles.css public/api.global.js public/calculator.global.js public/main.global.js public/chats.global.js public/favicon.svg; do
  mkdir -p "$(dirname "$f")"
  curl -fsSL "$BASE/$f" -o "$f" && echo "updated: $f" || echo "FAILED: $f"
done

echo "ALL DONE. Now press Save, then Restart in the Bonto UI, then hard-refresh the site."
