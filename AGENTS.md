# Plot — Codex Instructions

## TMDB Data: Never Hardcode IDs

**Never guess or hardcode TMDB IDs.** IDs are opaque integers with no pattern — guessing them returns wrong movies/shows.

When you need a TMDB ID or poster path, always resolve it at runtime using the search API:

```js
const results = await tmdb.search(title);
const match = results?.results?.find(r => r.media_type === 'movie' /* or 'tv' */);
// match.id, match.poster_path are now correct
```

Or fetch by known ID only if the ID came directly from a previous TMDB API response — never from memory.

This applies to: sample data, tests, fixtures, hardcoded lists, and any other static data that references TMDB content.

## Marketing

- **Weekly review / control room** — to review, edit, approve, or publish the week's
  marketing posts and newsletter, follow **`marketing/REVIEW.md`** start to finish.
- **Writing post copy** (the weekly batch's copy step) — follow **`marketing/copy/AGENT.md`**.

Both are model-agnostic runbooks. Run from the repo root on `main` with `.env` present;
never use a paid API for copy; confirm before anything that posts publicly.
