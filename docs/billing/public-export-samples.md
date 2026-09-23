# Public export samples

Inspected 17 September 2026. These are source references, not a claim that PLOT
supports their formats. No account access or provider contact was required.
No third-party implementation code was copied. Two minimised Trakt metadata
records were subsequently retained as a parser fixture; see the fixture README
for sanitisation and separately verified TMDB responses.

## Trakt

[Yamtrack export fixtures](https://github.com/FuzzyGrim/Yamtrack/tree/acd13841485ccebda2169b01c0b285d5f95a4b1d/src/integrations/tests/mock_data/trakt_export)
contain watched-history.json, ratings for movies/shows/seasons/episodes,
comments for movies/shows/seasons, and lists-watchlist.json. Inspected the
history and episode-rating JSON and the consuming importer tests directly.
History records include event IDs, watched_at, media type, episode ordinals,
separate episode/show external IDs; rating records have their own rated_at.
These are committed importer fixtures under mock_data, not independently
verified untouched account exports. Do not copy their test-only invented IDs
or assume every fixture ID is verified against TMDB.

[Consumer tests](https://github.com/FuzzyGrim/Yamtrack/blob/acd13841485ccebda2169b01c0b285d5f95a4b1d/src/integrations/tests/imports/test_trakt.py)
provide useful context for archive handling. Before reuse, review the project
licence, minimise personal data and verify selected external media identities.
Do not copy user-profile.json into PLOT fixtures.

[traktexport README](https://github.com/purarue/traktexport/blob/84e3735b9c2cbbe9e5f56e77474bec612511e02f/README.md)
also contains logged movie and episode API records from an actual export run.
That third-party exporter has a different envelope from a native Trakt ZIP;
its examples must not establish native archive compatibility.

## TV Time

[stubs.tv fixtures](https://github.com/korkje/stubs.tv/tree/5239ff6a772f2c45d0177116d45372a845b95098/packages/tvtime-import/tests/fixtures)
include tracking-prod-records.csv, tracking-prod-records-v2.csv,
followed_tv_show.csv, user_tv_show_data.csv, tv_show_rate.csv and liberator.json.
Inspected v2 and Liberator contents. They cover episode ordinals, rewatches,
specials, followed/archived shows and malformed rows. They are constructed
fixtures, not proof of a complete genuine GDPR archive.

The project's [format plan](https://github.com/korkje/stubs.tv/blob/5239ff6a772f2c45d0177116d45372a845b95098/docs/plans/tvtime-import.md)
explicitly retains a real redacted export as a pre-launch validation requirement.
Its fixtures therefore cannot remove the same requirement for PLOT.

[OpenTV Time fixtures](https://github.com/kodelio/opentv-time/tree/c705b136ca47be5569566c326d546f85c2765b4e/tests/fixtures/gdpr)
provide another CSV example set. Inspected v2: demo titles and constructed IDs
make its synthetic nature clear. Do not use those IDs for catalogue matches.

[Actual user-posted Liberator excerpt](https://forums.trakt.tv/t/tv-time-ratings-on-episodes-are-ignored/115212)
contains a watched episode, timestamp, TVDB IDs and rating. The author says it
came from their recent export. It is a partial JSON excerpt with ellipses, not
a parseable full file, and represents the browser-extension format rather than
the official GDPR CSV archive. Remove the UUID if deriving a minimal example.

## Consequence for PLOT

The earlier statement that no public samples were available was too broad.
Public fixture sets and authentic excerpts exist and can guide development.
They do not yet establish complete real-file compatibility. Next implementation
work should distinguish native Trakt archives, third-party Trakt exports, TV
Time GDPR CSVs and TV Time Liberator JSON as separate formats. Keep unverified
adapters disabled until real-file and identifier-resolution checks pass.

## TV Time Liberator publisher contract

Inspected the publisher at commit
[`a18caa46fbf8d611cc60f048c480e8981d7e6c05`](https://github.com/Hobo-Ware/tv-time-liberator/tree/a18caa46fbf8d611cc60f048c480e8981d7e6c05).
`src/extension/src/content.ts` writes separate `shows.json`, `movies.json`,
`lists.json` and `favorites.json` files, optionally inside a ZIP. Do not assume
an invented combined JSON envelope. The types under `src/core/types` define
show seasons, episode ordinals, media identifiers, watched state, ratings and
list membership. IMDb `-1` means unavailable. `rewatch_count` is an aggregate;
it does not provide the individual dates or event identities needed to create
reliable repeated-watch events.

`packages/core/tvTimeImport.js` implements the extracted JSON document boundary.
It returns entries plus explicit `notImported` and `warnings` reports. Its
caller must display both reports before confirming. Both apps now use the
report-bearing `parseImportDocument` wrapper, while the legacy array-only
`parsePlatform` stays unchanged. TV Time is separately gated behind
`tvTimeImportEnabled: false` pending real-file validation. Empty lists,
unwatched ratings and aggregate rewatches remain reported limitations. A
followed show with no watched episodes is reported rather than marked watched.
Timezone-free timestamps retain their calendar day and report lost time precision.

Tests use synthetic schema cases populated with the already sourced Trakt
identities and verified TMDB responses. They are not authentic TV Time export
samples and do not clear the real-file launch gate. No exporter implementation
code was copied and no TV Time account was accessed.


## GDPR CSV audit follow-up (17 September 2026)

The stubs.tv CSV fixtures at the pinned commit above use a synthetic
`created_at` timestamp on watch/rewatch keys and leave `most_recent_ep_watched`
empty. They cannot validate the nested watch-date representation reported in
[a real export import problem](https://forums.trakt.tv/t/incorrect-watch-dates-and-missing-data-after-importing-tv-time-gdpr-export/114645).
That first-hand report identifies `watch_date` inside `most_recent_ep_watched`,
but does not publish a parseable complete record. Do not promote created_at,
updated_at, air dates or rewatch counts into verified watch timestamps.

[TVmaze's own importer announcement](https://www.tvmaze.com/blogs/63/the-tv-time-importer-is-now-available)
also records real schema variation: exports can have `ep_id` or `episode_id`
without both. Its rating support was withdrawn because the voting keys could
not safely be mapped. This contradicts treating a single constructed fixture
or an assumed rating scale as a complete source contract.

The public repositories reneabreu/yamtrack-importer at
f015687995691a2618656e07d54f024299b3331c and lukearran/TvTimeToTrakt at
42ff96cb7790b664a2439b702f89b187c9ad9cde were checked for committed sample/test
exports; neither tree exposed such a fixture set. No implementation code was
copied. GDPR CSV remains unsupported rather than importing guessed watches.
The independently implemented Liberator format remains a separate adapter.
