#!/usr/bin/env bash
# Copies .env from the main checkout into the current worktree.
# Worktrees don't share gitignored files, so a fresh worktree has no .env
# and the app errors before rendering (missing Supabase/PostHog/etc vars).
set -euo pipefail

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

CURRENT_DIR="$(git rev-parse --show-toplevel)"

# The main checkout is the worktree whose path does NOT contain "/worktrees/"
MAIN_DIR="$(git worktree list --porcelain | awk '/^worktree /{print $2}' | grep -v '/worktrees/' | head -n1)"

if [[ -z "$MAIN_DIR" ]]; then
  echo "Could not find main checkout via 'git worktree list'." >&2
  exit 1
fi

if [[ "$MAIN_DIR" == "$CURRENT_DIR" ]]; then
  echo "Already in the main checkout ($MAIN_DIR) — nothing to do."
  exit 0
fi

if [[ ! -f "$MAIN_DIR/.env" ]]; then
  echo "No .env found in main checkout at $MAIN_DIR — nothing to copy." >&2
  exit 1
fi

if [[ -f "$CURRENT_DIR/.env" && "$FORCE" != true ]]; then
  echo ".env already exists in $CURRENT_DIR — use --force to overwrite."
  exit 0
fi

cp "$MAIN_DIR/.env" "$CURRENT_DIR/.env"
echo "Copied .env from $MAIN_DIR to $CURRENT_DIR"
