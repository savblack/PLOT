# Manual marketing flow

For producing a day's posts by hand — copy written by the subscription agent
(Claude Code / Codex), **not** the Anthropic API — with the media and copy saved
locally instead of auto-published.

Output lands in `plot-posts/<YYYY-MM-DD>/` at the repo root (git-ignored):
the rendered cards as `.jpg`, plus one combined copy doc `<date>.md`.

## Triggering with `/whats-on`

The whole flow runs from one command in **either** agent — same scripts, same
steps, just a per-tool wrapper (both user-level, not in this repo):

- **Claude Code** — `~/.claude/commands/whats-on.md`
- **Codex** — `~/.codex/prompts/whats-on.md`

Type `/whats-on` (today), `/whats-on 2026-06-18` (a date), or
`/whats-on --countdown="A,B" --otd=ID:YEARS` (curate) in either tool. The
wrapper just drives the `npm run mkt:manual…` steps below, so the scripts stay
the single source of truth — edit them, not the command, to change behaviour.

## The loop

```
1. build     npm run mkt:manual -- [YYYY-MM-DD] [--countdown="A,B"] [--otd=ID:YEARS]
                follows the weekly schedule for the run date's weekday: renders
                each renderable post's cards and scaffolds plot-posts/<date>/<date>.md
                with empty <copy> blocks (one section per scheduled post).

2. write      Fill every TODO in <date>.md following marketing/VOICE.md.
                Feed posts: X / Instagram / Threads / Alt text / What's On title +
                body. Feature posts: a Card block (the title to feature) + X /
                Instagram / Threads / Alt text. Question posts: text-only — just
                X / Instagram / Threads. Delete any post you don't want.

3. media      npm run mkt:manual:media -- [YYYY-MM-DD]
                renders a feature card for each title-based social post from the
                title named in its Card block (resolved via TMDB search). Feed
                posts already got media at build; question posts have no image.

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
| `text_question` | none — text only | — | — |
| `question_of_week` | none — text only | — | — |

The four feed types render at **build** from the planner payload. The three
feature types render a card at the **media** step (`feature.html`) from the
title in their Card block. The two question types are **text only** — no image.
None of the five social-only types are published to What's On — `publish.mjs`
skips them; post their copy (and any feature image) to social by hand. Giving
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
