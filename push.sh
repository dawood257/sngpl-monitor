#!/bin/bash
# Quick push — commit + push ek command me
# Usage: ./push.sh "Commit message"

cd "$(dirname "$0")"

MSG="${1:-Auto-commit $(date +%Y-%m-%d_%H:%M)}"

echo "═══════════════════════════════════════════"
git status --short
echo "═══════════════════════════════════════════"

# Safety check
if git status --short | grep -iE "token|\.key|\.crt|password|\.env|cert[^a]|\.db|\.log$|\.bak$"; then
  echo "🚨 Sensitive file detected! Aborting."
  exit 1
fi

git add .
git commit -m "$MSG" || { echo "Nothing to commit"; exit 0; }
git push

echo ""
echo "✅ Pushed: $MSG"
