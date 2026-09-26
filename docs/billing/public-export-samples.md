# Public export samples

Inspected 17 September 2026. These are source references, not a claim that PLOT
supports their formats. No account access or provider contact was required.
No third-party implementation code was copied. Two minimised Trakt metadata
records were subsequently retained as a parser fixture; see the fixture README
for sanitisation and separately verified TMDB responses.

## Netflix follow-up, 23 September 2026

Inspected the public `NetflixViewingHistory.csv` in
[previously-on-netflix at 3df3e05](https://github.com/akshitasure12/previously-on-netflix/blob/3df3e05decc921df2b1e3bdaf71d720ccedbea48/NetflixViewingHistory.csv).
Its Title/Date layout contains DD/MM/YY values and named episodes under numeric
season labels. Two title rows were retained with synthetic replacement watch
dates in `netflix-viewing-history.csv`; no account identity or TMDB IDs were
copied. The file exposed a real compatibility gap in short-year date handling.
The two episode names were subsequently resolved at runtime through the staging
catalogue Worker and imported into the existing synthetic QA account.

This is evidence for this public saved-file shape, not all export locales or
the separate account-wide `ViewingActivity.csv`. Full current Apple, Disney+
and Max export samples remain unverified. Do not treat importer implementations
or generic JSON examples as genuine provider exports.

## Remaining streaming sample search, 23 September 2026

A further GitHub/web search for Apple play-history CSVs, Apple's assumed
Item_Description/Event_End_Timestamp pair, Disney watch-history JSON and Max
export samples did not establish an authentic provider file. Results mostly
described third-party browser trackers, unrelated datasets or importer plans.
This is a bounded unsuccessful search, not evidence that exports do not exist.
The Apple/Disney/Max real-file validation gate remains open. Existing synthetic
transport tests cannot establish those provider contracts.

## Amazon playback export, 23 September 2026

Found a public saved [PrimeVideo.ViewingHistory.csv](https://github.com/JDizzle00/PythonScripts/blob/1eed86e871d33c4362328bf0b4454cd3e7dc7e1e/PrimeVideoStats/PrimeVideo.ViewingHistory.csv).
It uses Playback Start/End Datetime (UTC), Title and Seconds Viewed, plus many
device/network/location fields. The minimised fixture retains the headers and
two title strings, clears all other original values and inserts synthetic dates
and viewed seconds. No original location/device data or viewing dates are kept.

This file contains playback sessions, including partial plays and non-film
content. The parser therefore requires explicit title selection and displays a
warning before and after import. UTC playback start is retained at instant
precision. The sample also establishes an extra literal quote pair around some
titles. No locale-specific episode-title extraction or session-to-completed-watch
inference is made. Other native export versions remain unverified.

## IMDb watchlist follow-up, 23 September 2026

The public saved [Watchlist.csv in filmster](https://github.com/trygvels/filmster/blob/3ad8f4a3585326295d5e779ca0e18720cdf99dee/Watchlist.csv)
contains 78 movies, seven TV series, two TV movies and one TV miniseries.
Four minimised rows now cover those types, with personal dates, ratings and
descriptions cleared. The IMDb IDs were resolved through the staging catalogue
Worker and the returned TMDB responses captured separately. This extends
watchlist compatibility beyond movies; it does not validate TV rating imports,
episode lists, custom-list formats or every current export version.

The separate [ratings.csv at 21b18d2](https://github.com/trygvels/filmster/blob/21b18d2f21c87ebf5f2247993e756f2b85ae9d19/ratings.csv)
contains 80 series and 17 miniseries ratings, alongside movies and a few other
title types. One series and one miniseries were retained with synthetic ratings
and rating dates. These now establish series/miniseries rating annotations;
other title types and complete-file compatibility remain separate work. The
ratings do not establish episode completion or watch dates.

## Trakt

[Trakt API issue 815](https://github.com/trakt/trakt-api/issues/815), inspected
23 September 2026, publishes a first-hand watchlist response with null movie
IMDb/TMDB IDs and year. The sanitised fixture removes rank and clears the
personal listed date. It establishes nullable catalogue metadata, not a complete
export envelope. PLOT now allows these records into manual title review rather
than rejecting a whole file solely for missing metadata.

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
They do not establish complete real-file compatibility. The importer treats
native Trakt archives, third-party Trakt exports, TV Time GDPR CSVs and TV Time
Liberator JSON as separate formats. The TV Time GDPR adapter accepts the two
published tracking filenames and preserves episode ordinals, but the rollout
flag stays disabled until an authentic complete archive passes the same flow.

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

`packages/core/tvTimeImport.js` implements the extracted JSON and GDPR CSV document boundary.
It returns entries plus explicit `notImported` and `warnings` reports. Its
caller must display both reports before confirming. Both apps now use the
report-bearing `parseImportDocument` wrapper, while the legacy array-only
`parsePlatform` stays unchanged. TV Time is separately gated behind
`tvTimeImportEnabled: false` pending real-file validation. Empty lists,
unwatched ratings and aggregate rewatches remain reported limitations. A
followed show with no watched episodes is reported rather than marked watched.
Timezone-free timestamps retain their calendar day and report lost time precision.

Tests use synthetic schema cases populated with the already sourced Trakt
identities and verified TMDB responses, plus the pinned GDPR fixture headers.
They are not authentic complete TV Time exports and do not clear the real-file
launch gate. No exporter implementation code was copied and no TV Time account
was accessed.


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
