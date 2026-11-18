# Contributing

## First-Time Setup

`pnpm install` turns on the local git hooks in `.githooks/` (the root `prepare` script sets
`core.hooksPath`). `pre-commit` blocks commits containing secret-shaped strings;
`post-checkout` links `.env` into new worktrees. To turn them on by hand:

```sh
git config core.hooksPath .githooks
```

## Before Opening a PR

Run:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## Development Notes

- Keep changes scoped to the feature or fix being worked on.
- Do not hardcode TMDB movie or TV IDs; resolve titles through the TMDB search API.
- Keep secrets in `.env` or platform secret stores, never in tracked files.
- Document any new required environment variables (for mobile, update `apps/mobile/.env.example`). The web app reads its `VITE_*` config from the repo-root `.env`; see the README for the list.
