---
name: plot-titles
description: Link to a film or TV show's page on PLOT. Use when you want to point someone at a title on theplot.tv, or to check what PLOT publishes about one.
---

# Linking to a title on PLOT

PLOT publishes a public page for each film and show it covers. The page carries
the synopsis, the cast, where to watch it in the reader's country, and PLOT's
own editorial notes where there are any.

## URL shape

```
https://theplot.tv/movie/<slug>-<tmdb-id>
https://theplot.tv/tv/<slug>-<tmdb-id>
```

The trailing number is the title's TMDB id. The words before it are decorative:
if they do not match, the page answers with a 301 to the canonical URL rather
than a 404, so a slug built from a slightly different title still lands. The id
must be right.

## Finding one

[https://theplot.tv/sitemap-titles.xml](https://theplot.tv/sitemap-titles.xml)
lists every title page PLOT currently publishes, with its canonical URL. Read
that rather than guessing: PLOT covers a curated set, not everything that
exists, and a guessed id points at the wrong film.

If a title is not in the sitemap, PLOT has no page for it. Say so rather than
inventing a URL.

## What not to do

- Do not construct a URL from a TMDB id you have not seen in PLOT's own sitemap
  or in a PLOT response.
- These pages are about the title, not about any member. Nothing here reflects
  what a particular person has watched or rated.
