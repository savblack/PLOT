# Manual marketing flow

For producing a day's posts by hand — copy written by the subscription agent
(Claude Code / Codex), **not** the Anthropic API — with the media and copy saved
locally instead of auto-published.

Output lands in `plot-posts/<YYYY-MM-DD>/` at the repo root (git-ignored):
the rendered cards as `.jpg`, plus one combined copy doc `<date>.md`.

## The loop

```
1. build     npm run mkt:manual -- [YYYY-MM-DD] [--countdown="A,B"] [--otd=ID:YEARS]
                renders every selected post's cards (portrait + landscape) and
                scaffolds plot-posts/<date>/<date>.md with empty <copy> blocks.

2. write      Fill every TODO in <date>.md following marketing/VOICE.md.
                One <copy> block each for X / Instagram / Threads / Alt text /
                What's On title / What's On body. Delete any post you don't want.

3. publish    npm run mkt:manual:publish -- [YYYY-MM-DD] [--dry-run]
                validates the copy and upserts each post to theplot.tv/whats-on
                as status='published'. --dry-run parses + validates only.
```

Run from the main checkout (it has `.env` + `node_modules` + Playwright). The
`--` passes args through npm, e.g. `npm run mkt:manual -- 2026-06-17`.

## Selection

- **Explicit** (recommended for curation): `--countdown` names tracked titles to
  count down (any days-out, not just the cron's T-1/7/14 rungs); `--otd=ID:YEARS`
  forces an anniversary for a TMDB movie id. TMDB ids must come from a real API
  response — never guess them.
- **Auto** (no flags): runs the full planner ladder for the date and includes
  every post type that fires (slate on Mon, chart on Fri, countdowns, now
  streaming, trailer drop, anniversary).

## Why status='published'

The feed shows `pending_review | published | partially_published`. The auto
**publisher** only acts on `pending_review`, so writing these as `published`
makes them appear on the site without ever being re-posted to social. Topic keys
are `manual:…` and never collide with the cron planner. Re-running publish is
idempotent (upsert on `topic_key`).

The locally rendered cards are the branded social images (post them by hand);
the What's On hero uses the plain TMDB still, matching the automated pipeline.
