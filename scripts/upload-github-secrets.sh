#!/usr/bin/env bash
# Run once after: brew install gh && gh auth login
# Uploads VITE_* from .env to GitHub Actions secrets (same repo as origin).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Run: gh auth login   (then run this script again)"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing .env in $REPO_ROOT"
  exit 1
fi

REMOTE="$(
  git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##'
)"
if [[ -z "$REMOTE" ]]; then
  echo "No git remote origin"
  exit 1
fi

echo "Repository: $REMOTE"
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" != VITE_*=* ]]; then
    continue
  fi
  key="${line%%=*}"
  val="${line#*=}"
  # trim possible quotes
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  echo "Setting secret: $key"
  printf '%s' "$val" | gh secret set "$key" -R "$REMOTE"
done < .env

echo "Done. Push to main (or open Actions) to rebuild GitHub Pages."
