# Manual fallback

This is the fallback/debug path for building a day's posts by hand.

Primary production flow is still:

- GitHub prepares
- `admin.theplot.tv` reviews
- approved posts publish
- Sunday learning updates the rules

Use this manual flow only when you intentionally want a local, operator-led run.

## Output location

Manual artifacts now save to:

`/Users/savannahblack/Projects/PLOT/marketing/plot-posts/<YYYY-MM-DD>/`

That folder contains:

- rendered `.jpg` cards
- one combined copy document: `<date>.md`

## Commands

```sh
npm run mkt:manual -- [YYYY-MM-DD]
npm run mkt:manual:media -- [YYYY-MM-DD]
npm run mkt:manual:publish -- [YYYY-MM-DD] [--dry-run]
```

## Flow

1. `build`
   Creates the day's folder and scaffolds the copy doc.
2. `write`
   Fill in the TODO blocks using `marketing/VOICE.md`.
3. `media`
   Renders feature cards for title-based social posts.
4. `publish`
   Validates feed-eligible posts and upserts them to What's On.

## Notes

- Feed posts publish to the website.
- Social-only manual posts stay manual.
- Preview/debug artifacts still belong in `marketing/preview/out`.
- TMDB ids must come from a real API response. Never guess them.
