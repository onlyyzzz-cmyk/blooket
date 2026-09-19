#!/bin/sh
# Direct file updater for Bonto - no git involved.
# Run:  curl -fsSL https://raw.githubusercontent.com/onlyyzzz-cmyk/blooket/main/scripts/bonto-update.sh | sh
set -e
BASE="https://raw.githubusercontent.com/onlyyzzz-cmyk/blooket/main"
cd /app

FILES="index.js package.json requirements.txt worker.js \
api/app.py \
public/index.html public/chats.html public/styles.css public/favicon.svg \
public/api.global.js public/calculator.global.js \
public/main.global.js public/chats.global.js \
public/auth.global.js public/signup.global.js public/updates-auth.global.js \
public/sign-up.html public/terms.html public/privacy.html public/updates.html \
public/community.html public/forms.html"

echo "$FILES" | tr ' ' '\n' | while read -r f; do
  [ -z "$f" ] && continue
  mkdir -p "$(dirname "$f")"
  curl -fsSL "$BASE/$f" -o "$f" && echo "updated: $f" || echo "FAILED: $f"
done

echo "ALL DONE. Now press Save, then Restart in the Bonto UI, then hard-refresh the site."
