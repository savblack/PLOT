#!/usr/bin/env bash
# Idempotent Cloud Agent install. Safe to re-run against a cached snapshot.
# Installs workspace deps and Playwright Chromium (needed for test:smoke and
# test-storybook:web). Does not start servers, run tests, or apply migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

corepack enable
corepack prepare pnpm@10.6.3 --activate
pnpm install --frozen-lockfile

# --with-deps pulls the OS libraries Chromium needs. sudo is passwordless for
# the ubuntu user in .cursor/Dockerfile; a missing sudo (local laptop) still
# installs the browser into ~/.cache/ms-playwright.
if command -v sudo >/dev/null 2>&1; then
  pnpm --filter @plot/web exec playwright install --with-deps chromium
else
  pnpm --filter @plot/web exec playwright install chromium
fi

if [ -x "$ROOT/scripts/cloud-agent-write-env.sh" ]; then
  "$ROOT/scripts/cloud-agent-write-env.sh"
fi
