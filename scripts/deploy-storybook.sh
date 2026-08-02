#!/usr/bin/env bash
#
# Builds and deploys one app's Storybook to Cloudflare Pages as a static
# site. Copies the build output outside the repo before deploying — running
# `wrangler pages deploy` from anywhere under a directory that has its own
# wrangler.toml (e.g. apps/web, whose wrangler.toml is the deployed app's
# Worker config) makes wrangler pick that config up and reject it, since
# Pages doesn't support Worker-only keys like "assets"/"ratelimits".
#
# Also strips _headers/_redirects from the build output: Storybook's Vite
# build copies the app's public/ dir by default, and apps/web's _headers
# sets `X-Frame-Options: DENY` for the real app — fatal for Storybook, since
# its own preview pane loads stories inside an <iframe>.
#
# Usage: deploy-storybook.sh <app-dir> <cloudflare-pages-project-name>
#   e.g. deploy-storybook.sh apps/web plot-storybook-web-app
set -euo pipefail

app_dir=$1
project_name=$2
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
build_dir="$repo_root/$app_dir/storybook-static"
staging_dir=$(mktemp -d -t "deploy-$project_name")
trap 'rm -rf "$staging_dir"' EXIT

echo "→ Building Storybook in $app_dir"
(cd "$repo_root/$app_dir" && npm run build-storybook)

rm -f "$build_dir/_headers" "$build_dir/_redirects" "$build_dir/wrangler.json" "$build_dir/wrangler.toml"
cp -r "$build_dir/." "$staging_dir/"

echo "→ Deploying to Cloudflare Pages project: $project_name"
(cd "$staging_dir" && npx wrangler pages deploy . --project-name "$project_name" --branch main)
