# workers-auto-deploy

Status: active
Branch: agent/2026-11-11-workers-auto-deploy
Owner: Jacob (deploys), built by Claude Code
Updated: 2026-11-11

## In plain words

Cloudflare Workers now deploy themselves when a change to them is merged, instead of waiting for someone to run a command on a laptop. It does nothing until Savannah adds a Cloudflare token to GitHub.

## Done

- `.github/workflows/workers-deploy.yml`: deploys only the Workers a merge changed, plus the Workers that import them. tmdb-proxy deploys to both production and staging. Worker tests run first, and a failed deploy opens an `incident` issue and sends an email.
- `AGENTS.md`: the deploy line now points at the workflow.
- Verified: YAML parses, and the change detection was simulated against real commits (uptime, whats-on-watch, tmdb-proxy, whatsOnHealth, dispatch-all, bogus names, an unrelated commit).

## Next

1. Savannah creates a Cloudflare API token ("Edit Cloudflare Workers" template) and adds it as the GitHub secret `CLOUDFLARE_API_TOKEN`.
2. Merge, then run the workflow once by hand with "all" to confirm it deploys.

## Open decision (not in this PR)

The weekly marketing batch stays on the Mac: it uses the Grok login in ~/.grok and macOS sandbox-exec, and AGENTS.md forbids a paid API for copy.
