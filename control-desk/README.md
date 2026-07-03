# PLOT Operator Desk

Standalone internal operator app for the new Buffer-style marketing workflow.

## Local app

Run from the repo root:

```sh
npm run desk:dev
npm run desk:build
```

Browser env:

- `VITE_OPERATOR_API_URL`
- or `VITE_SUPABASE_URL` so the app can derive `.../functions/v1/operator-api`

## Function secrets

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BUFFER_API_KEY`
- `OPERATOR_ADMIN_TOKEN`
- `OPERATOR_SYNC_SECRET`

Useful optional values:

- `OPERATOR_REVIEW_URL`
- `OPERATOR_PUBLISH_URL`
- `OPERATOR_PUBLISH_SECRET`

## Runtime flow

1. `marketing/generate/generate.mjs` renders legacy marketing rows and syncs them into `operator_posts` as drafts.
2. The operator app works against `operator-api`.
3. `operator-publish` sends due approved posts to Buffer and writes compatibility state back into `marketing_posts` and `marketing_post_publications`.
4. `/whats-on` continues reading the legacy marketing tables during the transition.
