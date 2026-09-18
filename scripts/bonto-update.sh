#!/bin/sh
# One-line updater for the Bonto deployment.
# Run:  curl -fsSL https://raw.githubusercontent.com/onlyyzzz-cmyk/blooket/main/scripts/bonto-update.sh | sh
set -e
cd /app

if git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Updating existing repo..."
  git fetch origin main
  git reset --hard origin/main
else
  echo "Setting up git for the first time..."
  git init -q
  git remote add origin https://github.com/onlyyzzz-cmyk/blooket.git 2>/dev/null || true
  git fetch origin main
  git reset --hard origin/main
fi

echo "Done. Now press Save and Restart in the Bonto UI."
