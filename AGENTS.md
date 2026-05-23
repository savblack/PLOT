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
