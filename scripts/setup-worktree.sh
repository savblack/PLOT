#!/usr/bin/env bash
# Symlinks gitignored .env files from the main checkout into the current
# worktree, so every worktree always reads the exact same live file instead
# of a point-in-time copy. Worktrees don't share gitignored files on their
# own, so a fresh worktree has none of them and the app errors, or silently
# can't authenticate, before rendering (missing Supabase/PostHog/etc vars).
# Because it's a link, not a copy, rotating a key in the main checkout's
# .env takes effect everywhere immediately, no re-run needed.
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

# Add a new gitignored env file here whenever another app in the monorepo
# grows one (each app loads its own, e.g. Expo reads apps/mobile/.env, Vite
# reads the repo-root .env).
ENV_FILES=(
  ".env"
  "apps/mobile/.env"
)

linked_any=false
for rel in "${ENV_FILES[@]}"; do
  src="$MAIN_DIR/$rel"
  dest="$CURRENT_DIR/$rel"

  [[ -f "$src" ]] || continue

  if [[ -e "$dest" && "$FORCE" != true ]]; then
    echo "$rel already exists in $CURRENT_DIR — use --force to relink."
    continue
  fi

  mkdir -p "$(dirname "$dest")"
  ln -sf "$src" "$dest"
  echo "Linked $rel -> $src"
  linked_any=true
done

if [[ "$linked_any" != true ]]; then
  echo "Nothing new to link."
fi
