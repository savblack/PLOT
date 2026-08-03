# Web ↔ Mobile Reconciliation (Track 0)

> **Historical — kept for the source-of-truth decisions, not as a current status
> report.** This documents the pre-extraction state, when web and mobile were
> separate repos. `packages/core` now exists and both apps consume it. The
> `importParsing` action item below was finished later than the rest: core was
> authored during Track 1 but mobile only switched off its own
> `lib/importParsers.ts` in the Phase 1 core-hoist. For how parity is maintained
> today, see the "Web → mobile parity" section of `AGENTS.md`.

Source-of-truth decisions for the shared `core/` extraction, from a direct file-by-file
diff of web `src/` against `plot-mobile` (`savblack/plot-mobile`, last commit `869c3cd`).

## Headline correction

The mobile app is **functional, not a shell of stubs** (an earlier exploration overstated
this). Verified directly:

- `guide.tsx` (520 loc) has real TVMaze `fetch` calls — not a placeholder.
- `useCustomLists` persists: `insert`/`update`/`delete` on `lists` + `list_items`.
- `useTopLists` **upserts** to `top_lists` with rank reordering (not "persistence missing").
- `useWatchlist` writes to `list_items`. No `TODO`/`FIXME`/`not-implemented` markers anywhere.

The real problem is **logic staleness**, not missing wiring: every shared hook in mobile is a
leaner, older version of its web counterpart. So Track 0 is an *audit + decision* exercise —
the fix is the `core/` extraction (Track 1), **not** hand-patching mobile's standalone files
(which Track 1 replaces — patching them now is throwaway work).

## Drift, one direction: web is ahead

| Shared hook | web loc | mobile loc | mobile is |
|---|--:|--:|---|
| useWatchlist | 198 | 84 | <½ — missing list ops / sync |
| useWatching | 165 | 77 | <½ |
| useTopLists | 141 | 113 | subset (persists, fewer ops) |
| useCustomLists | 124 | 100 | subset (persists) |
| useHistory | 100 | 75 | subset |
| useFavorites | 81 | 65 | subset |

`api/tmdb`: web 340 loc / ~30 methods, mobile 170 loc — **missing 12**: `getNowPlaying`,
`getAiringToday`, `getTVOnTheAir`, `getStreamingMovies`, `getStreamingTV`, `getTopRated`,
`getGenres`, `getEpisode`, `getDigitalReleaseDate`, `discoverBrowse`, `discoverByGenres`,
`discoverNewByProviders`.

Of web's 23 hooks, mobile has 8. The 15 absent are mostly web-specific (DOM/theme/follows/
share/Plex/Trakt/drag-scroll) and only get ported into core if a mobile screen needs them.

## Source-of-truth decisions

| File | Decision |
|---|---|
| `api/tmdb` | **Web canonical.** Core = web's full method set (already config-injected). Mobile's 12 missing methods come for free on import. |
| `api/supabase` | **Web canonical** (now lazy Proxy + config injection). Mobile's only addition — AsyncStorage auth persistence — becomes the injected `storage`/auth-options adapter. |
| `api/functions` | **Web canonical.** |
| `domain/importParsing` | **Merge — mobile has the better factoring.** Mobile extracted pure `parseNetflix/parsePrime/parseDisney/parseMax/parseApple` into a lib; web's equivalents are trapped inline in the 740-loc `ImportView.jsx` (lines 138+). Core = mobile's platform parsers **+** web's `parseLetterboxd`/`parseCSV`/`findCol`/`normaliseDate`. Then refactor web `ImportView.jsx` to import them. *(This is the "vice versa" direction — mobile → web.)* |
| `utils/storage` | **Platform adapter — stays per-platform.** localStorage (+`canUseDOM`, `getSystemColorScheme`) vs AsyncStorage. Core depends on an injected `storage`; neither file enters core verbatim. |
| `utils/timezones` | Near-identical (107 vs 101). Web canonical; trivial merge. |
| `styles/tokens` | **New shared token object.** Web is CSS `:root` vars, mobile is a TS `colors`/… object. Adopt mobile's object shape as the shared source; web generates its CSS vars from it. Values already match. |
| 6 shared data hooks | **Web canonical** for all six. Core hooks = web logic with config + storage injected. |
| `useCurrentUser` (mobile-only) | Session/user logic goes into core; web continues to wire it through `AppContext`, mobile through this hook. |

## Implication for sequencing

Track 0 found nothing that needs standalone fixing before extraction — the mobile files are
either (a) stale subsets of web (resolved by importing core), (b) platform adapters that stay
separate, or (c) the single `importParsing` merge, which is naturally done *as part of*
authoring `core/`. **Recommendation: proceed directly to Track 1** (extract canonical `core/`
from the sources chosen above) rather than hand-patching mobile's soon-to-be-replaced files.
