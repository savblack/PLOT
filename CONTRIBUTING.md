# Contributing

## Before Opening a PR

Run:

```sh
npm ci
npm run check
```

## Development Notes

- Keep changes scoped to the feature or fix being worked on.
- Do not hardcode TMDB movie or TV IDs; resolve titles through the TMDB search API.
- Keep secrets in `.env` or platform secret stores, never in tracked files.
- Update `.env.example` when adding required environment variables.
