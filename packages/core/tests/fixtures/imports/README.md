# Import fixture provenance

`imdb-movie-ratings.csv`: first two movie records from the published IMDb CSV in
[diego's example silo](https://github.com/ttybitnik/diego/blob/cae45a0d50b3056330701b19e24e68017d5061cf/examples/silo/imdb_ratings.csv),
retrieved 16 September 2026 through the GitHub API. Header and catalogue metadata
retained. Personal ratings changed to 5 and rating dates cleared for the test
fixture. IMDb IDs are copied from the export, never inferred from movie names.
This proves only the documented movie-ratings shape. It is not evidence of TV,
watchlist, custom-list or future export-format support.

`imdb-movie-match.json`: captured TMDB search result, checked against movie
details and its external IMDb ID on 16 September 2026. Used to test external-ID
precedence without inventing catalogue identifiers.

`tmdb-episode-series.json`: captured exact-name, exact-year TV search result for
Severance from TMDB on 16 September 2026. The episode ordinal used in tests is a
synthetic watch scenario, not an invented TMDB episode ID or an export sample.

`tmdb-episode-season.json` and `tmdb-episode-season-two.json`: the first four
episode records from seasons 1 and 2 of the verified series above, captured from
TMDB on 16 September 2026. Retain returned IDs, names and episode ordinals only.
The browser fixture intentionally shows a four-episode subset for testing;
it is not an assertion that either real season contains only four episodes.

`letterboxd-watchlist.csv`: first two rows of the public saved export at
https://github.com/ttybitnik/diego/blob/cae45a0d50b3056330701b19e24e68017d5061cf/examples/silo/letterboxd_watchlist.csv.
The filename distinguishes this from watched.csv, whose column shape is identical.

`letterboxd-custom-list.csv`: two records and metadata from the public saved export
https://github.com/extratone/bilge/blob/3696d149a8c9bb905d877b67d9347b1a2f90ba65/curation/letterboxd/lists/software-history.csv.
Tags and list description were blanked in the sanitised copy; field structure,
list identity and title/year rows are retained. Neither fixture contains TMDB IDs.

`tmdb-list-matches.json`: movie search responses captured from TMDB on 17 September
2026 (Sydney) for the two titles in the saved custom-list sample. One search has
no movie match; the browser test deliberately leaves that row unmatched.

`imdb-watchlist.csv`: first two movie rows from
https://github.com/ttybitnik/diego/blob/cae45a0d50b3056330701b19e24e68017d5061cf/examples/silo/imdb_watchlist.csv.
No account identifiers or personal descriptions are present in these rows.
Created/Modified/Date Rated are not watch dates. IMDb custom lists have similar
columns but no stable list identity in this sample; renamed/other list files are
rejected rather than silently being treated as watched history.

`trakt-history.json`: one episode and one movie from Yamtrack's committed
[history fixture](https://github.com/FuzzyGrim/Yamtrack/blob/acd13841485ccebda2169b01c0b285d5f95a4b1d/src/integrations/tests/mock_data/trakt_export/watched-history.json).
Only event identity, media identity and episode ordinals retained; dates cleared
to null and TMDB/Plex identifiers removed. This is a third-party importer fixture,
not independently verified native account-export evidence. PLOT resolves IMDb
identifiers at runtime. No third-party implementation code was copied.

`tmdb-trakt-matches.json`: TMDB `/find` responses for the two IMDb identities
in `trakt-history.json`, retrieved server-side on 17 September 2026. Browser
fixtures use these responses rather than copying unverified TMDB integers from
the source archive. The production proxy did not yet accept the new find route;
its pending deployment remains a rollout prerequisite.

`tmdb-tvdb-match.json`: live TMDB `/find` response for the TVDB series identity
in the Trakt history fixture, captured on 17 September 2026. Used to prove
TVDB lookup precedence and to avoid guessing TMDB catalogue identifiers.

`trakt-watchlist.json`: first movie and show from Yamtrack's
lists-watchlist.json at commit acd13841485ccebda2169b01c0b285d5f95a4b1d.
Listed timestamps cleared; Plex, slug and unverified TMDB identifiers removed.
External IMDb/TVDB identities and the record shape are retained. This is a
third-party importer fixture, not independently verified native-export evidence.
Parser tests do not treat these source identifiers as confirmed TMDB matches.
Browser tests use synthetic watchlist records with previously captured TMDB
responses from the history fixture.

`trakt-annotations.json` and `trakt-season-comment.json`: minimised records from
Yamtrack's ratings-shows.json, ratings-episodes.json and comments-seasons.json
at acd13841485ccebda2169b01c0b285d5f95a4b1d. Timestamps cleared; review text replaced
with neutral test text; comment-author data, social counters, Plex identifiers
and unverified TMDB identifiers omitted. External identifiers remain unverified
provenance until the shared resolver runs. Empty movie-rating/movie-comment
fixtures in that source do not establish real movie-annotation compatibility.


`letterboxd-diary.csv`, `letterboxd-watched.csv`, `letterboxd-ratings.csv` and
`letterboxd-reviews.csv`: minimised rows from the same public saved export at
extratone/bilge commit 3696d149a8c9bb905d877b67d9347b1a2f90ba65, under
`curation/letterboxd/`. Headers and catalogue/entry URLs retained. Dates and tags
cleared, ratings replaced with 3 stars, review text replaced with "Saved review".
No TMDB IDs are present. Inspection found 92 review URLs also present in diary.csv;
those URLs identify logged entries, unlike watched/ratings film URLs. These
fixtures establish the saved CSV layouts, not current-version universality.
