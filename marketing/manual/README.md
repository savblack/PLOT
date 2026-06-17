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
                Feed posts: X / Instagram / Threads / Alt text / What's On title +
                body. Social-only posts: a Card block (the title to feature, or the
                question to print on the image) + X / Instagram / Threads / Alt text.
                Delete any post you don't want.

3. media      npm run mkt:manual:media -- [YYYY-MM-DD]
                renders the social-only cards from their Card blocks: a feature
                card for the named title (resolved via TMDB search), or a
                typographic question card. Feed posts already got media at build.

4. publish    npm run mkt:manual:publish -- [YYYY-MM-DD] [--dry-run]
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

| Type | Card | When rendered | Goes to What's On? |
|------|---|---|:---:|
| `weekly_slate` (Upcoming this week) | titles carousel | build | ✓ |
| `trending_chart` (Trending top 10) | the weekly chart | build | ✓ |
| `on_this_day` (Anniversary) | title over backdrop | build | ✓ |
| `countdown` | title + day count | build | ✓ |
| `spotlight` | feature (title over backdrop) | media | — |
| `hidden_gem` | feature | media | — |
| `what_to_watch_tonight` | feature | media | — |
| `text_question` | typographic question | media | — |
| `question_of_week` | typographic question | media | — |

All nine types get branded media. The four feed types render at **build** from
the planner payload. The five social-only types render at the **media** step
from the Card block (`feature.html` for the title-based ones, `question.html`
for the questions). The social-only types are **not** published to What's On —
`publish.mjs` skips them; post their images + copy to social by hand. Giving
them feed articles too would need a migration to widen the
`marketing_posts.post_type` check constraint and the feed's type metadata.

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
