# CI minutes

All CI runs on GitHub Actions. Pull-request and `main` validation is
`.github/workflows/ci.yml` (workflow `CI`, job `check`). Scheduled jobs
(backups, publishing, data refreshes, the write-path check) are the other files
in `.github/workflows`, which is also where their failure alerts live.

The repository is public, so standard GitHub-hosted runners cost nothing. The
weekly marketing batch uses the macOS runner, which is also free on a public
repository.

## History

- 2026-09-19: PR and `main` validation moved from GitHub Actions to CircleCI,
  to save Actions minutes while the repository was private.
- 2026-11-12: scheduled jobs confirmed to live only on GitHub (the CircleCI
  schedule triggers had never been created; the GitHub workflows were the only
  copies that ever ran).
- 2026-11-12: CircleCI removed. The repository is public, so validation moved
  back to `.github/workflows/ci.yml`. Disconnect the project in CircleCI's
  dashboard if it is still listed there; nothing in this repository reads it.

GitHub billing reference:
https://docs.github.com/en/billing/reference/actions-runner-pricing

## How much of the suite runs

`scripts/ci-tier.mjs` prints `none`, `fast`, or `full` from the diff against `origin/main`. On `none`, CI skips every step after the secret scan. `fast` runs lint, unit tests, the contract checks, the production build, and the mobile typecheck. `full` adds the web Storybook build, Storybook interaction tests, and Playwright.

| Tier | When | What runs |
| --- | --- | --- |
| `none` | `docs/**`, root `*.md`, and `marketing/**/*.md` only | Secret scan, then stop |
| `fast` | Everything else that is not visual, including `packages/core`, Supabase, and scripts | Lint, tests, contract checks, build, mobile typecheck |
| `full` | `apps/web`, `apps/website`, `apps/mobile`, `packages/ui`, token files, `*.stories.*`, a `full-ci` label, or `[full-ci]` in the commit message | Fast, plus web Storybook, interaction tests, and Playwright |

Website and mobile Storybook builds run only when their own story files change. Chromatic was removed on 2026-11-12. The `full-ci` label is read from the pull request when the run starts; add it, then push again.

A commit message containing `[skip ci]` skips CI entirely. Use that for a work-in-progress push that exists only so a cloud agent can resume. Do not open a pull request for that push.

A newer push to the same pull request cancels the older CI run. Pushes to `main` are never cancelled, because each one deploys.

A Cursor Automation that only comments does not change the tier. One that pushes a commit starts a new CI run, classified from that new diff. A trigger on "CI completed" still fires when a docs-only run stopped after the secret scan.

The weekly marketing batch stays on the GitHub macOS runner until a Saturday of copy from the coding Grok agent has been compared with it. That agent's assignment is `marketing/copy/GROK-HANDOFF.md`. It downloads the run's artifact and runs `node marketing/copy/check.mjs` once. It does not run the weekly command. Alix does not write this comparison. This schedule stays on.

## Guardrails

- PRs and `main` pushes run CI at the tier above. A docs-only push does not install or build. An app change on `main` still runs the full tier, because that push deploys.
- Two flows merge on CI's result, and both identify it by its file,
  `.github/workflows/ci.yml`, never by the name "CI" or "check", which any
  workflow can borrow:
  - `scripts/auto-merge.mjs` requires the latest run of that file on the exact
    head commit, for that PR against `main` (or a push to `main`), to have
    succeeded.
  - `dependabot-automerge.yml` wakes on `workflow_run` of `CI`, then re-reads
    the latest `pull_request` run of that file against `main` for the commit
    from the API, and merges only a PR that run belongs to.
  - Why "against `main`": a `pull_request` run uses its base branch's copy of
    `ci.yml`. A second PR with the same head and a decoy base could otherwise
    report a green run for the same commit.
- `scripts/lib/autoMergePolicy.mjs` keeps any change to `ci.yml`,
  `dependabot-automerge.yml` or the tier rules (`scripts/ci-tier.mjs`,
  `scripts/agent/ciTier.mjs`) waiting for Savannah, so an agent fix cannot
  loosen the checks it is judged by.
- Branch protection on `main` (since 2026-11-12) requires the `check` job from
  GitHub Actions (app id 15368). Admins may bypass it; release-please PRs need
  that, since they do not start CI. Force-pushes and deleting `main` are off.
- Routine Actions minor/patch dependency upgrades share a Dependabot PR; major
  upgrades retain individual review.
