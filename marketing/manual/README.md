# Manual marketing flow

For producing a day's posts by hand — copy written by the subscription agent
(Claude Code / Codex), **not** the Anthropic API — with the media and copy saved
locally instead of auto-published.

Output lands in `plot-posts/<YYYY-MM-DD>/` at the repo root (git-ignored):
the rendered cards as `.jpg`, plus one combined copy doc `<date>.md`.

## The loop

```
1. build     npm run mkt:manual -- [YYYY-MM-DD] [--countdown="A,B"] [--otd=ID:YEARS]
                follows the weekly schedule for the run date's weekday: renders
                each renderable post's cards and scaffolds plot-posts/<date>/<date>.md
                with empty <copy> blocks (one section per scheduled post).

2. write      Fill every TODO in <date>.md following marketing/VOICE.md.
                One <copy> block each for X / Instagram / Threads / Alt text /
                What's On title / What's On body. Delete any post you don't want.

3. publish    npm run mkt:manual:publish -- [YYYY-MM-DD] [--dry-run]
                validates and upserts the feed-eligible posts to
                theplot.tv/whats-on as status='published'. Social-only posts are
                skipped (post their images/copy by hand). --dry-run validates only.
```

Run from the main checkout (it has `.env` + `node_modules` + Playwright). The
`--` passes args through npm, e.g. `npm run mkt:manual -- 2026-06-17`.

## Weekly schedule

The run **date's weekday** decides the post mix (`schedule.mjs`):

| Day | Posts |
|-----|-------|
| Mon | Upcoming this week |
| Tue | Anniversary · Spotlight · Text question · Countdown |
| Wed | What to watch tonight · Anniversary · Spotlight · Countdown |
| Thu | Anniversary · Spotlight · Text question · Countdown |
| Fri | Trending top 10 |
| Sat | Hidden gem · Anniversary · Spotlight · Countdown |
| Sun | Question of the week · Anniversary · Spotlight · Countdown |

Each label maps to a post type:

| Type | Renders a card? | Goes to What's On? | Notes |
|------|:---:|:---:|---|
| `weekly_slate` (Upcoming this week) | ✓ | ✓ | carousel of the week's titles |
| `trending_chart` (Trending top 10) | ✓ | ✓ | the weekly chart |
| `on_this_day` (Anniversary) | ✓ | ✓ | milestone anniversary |
| `countdown` | ✓ | ✓ | nearest upcoming tracked title |
| `spotlight` | — | — | single-title feature; agent picks the title |
| `hidden_gem` | — | — | under-seen pick; agent picks the title |
| `what_to_watch_tonight` | — | — | recommendation; agent picks the title |
| `text_question` | — | — | text-only engagement post |
| `question_of_week` | — | — | text-only engagement post |

The four renderable types have card templates and are published to the feed.
The rest are **social-only** for now: the build scaffolds a copy section for each
(no image), the agent writes the copy, and they're posted to social by hand —
`publish.mjs` skips them. Giving them branded cards (and feed support) needs new
templates plus a migration to widen the `marketing_posts.post_type` check
constraint and the feed's type metadata.

## Curating / overriding

The flags override the schedule entirely:

- `--countdown="Title A,Title B"` — count down specific tracked titles (any
  days-out, not just the cron's T-1/7/14 rungs).
- `--otd=ID:YEARS` — an anniversary for a specific TMDB movie id.

TMDB ids must come from a real API response (the tracked table or a live
search) — never guess them (CLAUDE.md). Edit `schedule.mjs` to change the mix.

## Why status='published'

The feed shows `pending_review | published | partially_published`. The auto
**publisher** only acts on `pending_review`, so writing these as `published`
makes them appear on the site without ever being re-posted to social. Topic keys
are `manual:…:<date>:…` and never collide with the cron planner. Re-running
publish is idempotent (upsert on `topic_key`).

The locally rendered cards are the branded social images (post them by hand);
the What's On hero uses the plain TMDB still, matching the automated pipeline.
